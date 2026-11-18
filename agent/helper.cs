// Ajudante do agente da Central do PC.
//
// O agente (agent.js) abre este programa uma vez e conversa com ele por linhas de texto:
// cada pedido que chega pela entrada padrão recebe UMA linha de JSON na saída.
//
//   info             dados fixos do processador
//   metrics          memória, processos, discos, temperaturas e estado da sessão
//   shot <arquivo>   salva um print da tela em JPEG (no máximo ~1,4 MB)
//   sleep            suspende o PC
//   awake 1|0        impede (1) ou volta a permitir (0) que o PC repouse sozinho
//
// Iniciado com o argumento "awake", já começa impedindo o repouso.
//
// Fica aberto para ler os processos a cada poucos segundos sem custo de inicialização.
// O pedido de "manter acordado" do Windows vale enquanto este processo existir: se o
// agente parar, o PC volta a repousar normalmente.
// É compilado pelo install.ps1 com o csc.exe que já vem no Windows (.NET Framework 4),
// por isso o código fica em C# 5: sem interpolação de strings, sem "?." e afins.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class Helper
{
    [StructLayout(LayoutKind.Sequential)]
    struct PERFORMANCE_INFORMATION
    {
        public int cb;
        public IntPtr CommitTotal;
        public IntPtr CommitLimit;
        public IntPtr CommitPeak;
        public IntPtr PhysicalTotal;
        public IntPtr PhysicalAvailable;
        public IntPtr SystemCache;
        public IntPtr KernelTotal;
        public IntPtr KernelPaged;
        public IntPtr KernelNonpaged;
        public IntPtr PageSize;
        public int HandleCount;
        public int ProcessCount;
        public int ThreadCount;
    }

    [DllImport("psapi.dll", SetLastError = true)]
    static extern bool GetPerformanceInfo(out PERFORMANCE_INFORMATION info, int size);

    [DllImport("user32.dll")]
    static extern bool SetProcessDPIAware();

    [DllImport("kernel32.dll")]
    static extern uint SetThreadExecutionState(uint flags);

    const uint ES_CONTINUOUS = 0x80000000;
    const uint ES_SYSTEM_REQUIRED = 0x00000001;

    [DllImport("powrprof.dll")]
    static extern uint PowerGetActiveScheme(IntPtr root, out IntPtr scheme);

    [DllImport("powrprof.dll")]
    static extern uint PowerReadACValueIndex(IntPtr root, IntPtr scheme, ref Guid subgroup, ref Guid setting, out uint value);

    [DllImport("powrprof.dll")]
    static extern uint PowerReadDCValueIndex(IntPtr root, IntPtr scheme, ref Guid subgroup, ref Guid setting, out uint value);

    [DllImport("kernel32.dll")]
    static extern IntPtr LocalFree(IntPtr memory);

    // "O que acontece ao fechar a tampa": 0 nada, 1 suspender, 2 hibernar, 3 desligar.
    static readonly Guid ButtonsGroup = new Guid("4f971e89-eebd-4455-a8de-9e59040e7347");
    static readonly Guid LidAction = new Guid("5ca83367-6e45-459f-a27b-476b1d01c936");

    const double GB = 1024.0 * 1024.0 * 1024.0;
    const long ShotLimit = 1400000;   // o servidor aceita até 1,5 MB

    class Agg
    {
        public int Count;
        public double Cpu;
        public long Memory;
    }

    static Dictionary<int, double> prevCpu = new Dictionary<int, double>();
    static DateTime prevAt = DateTime.MinValue;
    static string tempNs;
    static DateTime tempProbeAt = DateTime.MinValue;
    static int sessionId;

    static int Main(string[] args)
    {
        // Sem isto, em telas com escala (125%, 150%...) o print sairia cortado.
        SetProcessDPIAware();
        sessionId = Process.GetCurrentProcess().SessionId;
        // O pedido vale para a thread que o fez: esta, que fica viva lendo os pedidos.
        if (args.Contains("awake")) Awake(true);

        // UTF-8 direto nos fluxos: este processo não tem janela de console.
        var utf8 = new UTF8Encoding(false);
        var input = new StreamReader(Console.OpenStandardInput(), utf8);
        var output = new StreamWriter(Console.OpenStandardOutput(), utf8);
        output.AutoFlush = true;
        var json = new JavaScriptSerializer();

        string line;
        while ((line = input.ReadLine()) != null)
        {
            object reply;
            try
            {
                if (line == "metrics") reply = Metrics();
                else if (line == "info") reply = Info();
                else if (line.StartsWith("shot ")) { Shot(line.Substring(5)); reply = Ok(); }
                else if (line == "sleep") { Application.SetSuspendState(PowerState.Suspend, false, false); reply = Ok(); }
                else if (line == "awake 1" || line == "awake 0") { Awake(line == "awake 1"); reply = Ok(); }
                else reply = Fail("Pedido desconhecido.");
            }
            catch (Exception e)
            {
                reply = Fail(e.Message);
            }
            output.WriteLine(json.Serialize(reply));
        }
        return 0;   // o agente fechou a entrada
    }

    static Dictionary<string, object> Ok()
    {
        return new Dictionary<string, object> { { "ok", true } };
    }

    static Dictionary<string, object> Fail(string message)
    {
        return new Dictionary<string, object> { { "ok", false }, { "error", message } };
    }

    static double Round1(double value)
    {
        return Math.Round(value, 1);
    }

    static Dictionary<string, object> Info()
    {
        int cores = 0;
        try
        {
            using (var search = new ManagementObjectSearcher("SELECT NumberOfCores FROM Win32_Processor"))
            {
                foreach (ManagementObject cpu in search.Get()) cores += Convert.ToInt32(cpu["NumberOfCores"]);
            }
        }
        catch
        {
            // Sem WMI: o agente usa o número de threads no lugar.
        }
        var reply = Ok();
        reply["cores"] = cores;
        return reply;
    }

    static Dictionary<string, object> Metrics()
    {
        PERFORMANCE_INFORMATION info;
        if (!GetPerformanceInfo(out info, Marshal.SizeOf(typeof(PERFORMANCE_INFORMATION))))
            throw new InvalidOperationException("GetPerformanceInfo falhou.");
        double page = info.PageSize.ToInt64();
        double total = info.PhysicalTotal.ToInt64() * page;
        double avail = info.PhysicalAvailable.ToInt64() * page;

        var reply = Ok();
        reply["ram"] = new Dictionary<string, object>
        {
            { "totalGB", Round1(total / GB) },
            { "usedGB", Round1((total - avail) / GB) },
            { "availableGB", Round1(avail / GB) },
            { "cacheGB", Round1(info.SystemCache.ToInt64() * page / GB) },
            { "commitGB", Round1(info.CommitTotal.ToInt64() * page / GB) },
            { "commitLimitGB", Round1(info.CommitLimit.ToInt64() * page / GB) },
        };
        reply["processCount"] = info.ProcessCount;
        reply["procs"] = Procs();
        reply["disks"] = Disks();
        reply["temps"] = Temps();
        reply["session"] = SessionState();
        reply["power"] = PowerInfo();
        return reply;
    }

    // Só impede o repouso por tempo parado. A tampa, o botão de energia e a bateria crítica
    // continuam funcionando como sempre.
    static void Awake(bool on)
    {
        if (SetThreadExecutionState(on ? ES_CONTINUOUS | ES_SYSTEM_REQUIRED : ES_CONTINUOUS) == 0)
            throw new InvalidOperationException("O Windows recusou o pedido.");
    }

    // Tomada ou bateria, carga e o que a tampa faz. Null em PC sem bateria (desktop).
    static Dictionary<string, object> PowerInfo()
    {
        PowerStatus s = SystemInformation.PowerStatus;
        if (s.BatteryChargeStatus == BatteryChargeStatus.Unknown || (s.BatteryChargeStatus & BatteryChargeStatus.NoSystemBattery) != 0)
            return null;
        return new Dictionary<string, object>
        {
            { "ac", s.PowerLineStatus == PowerLineStatus.Online },
            { "pct", (int)Math.Round(s.BatteryLifePercent * 100) },
            { "lidAc", Lid(true) },
            { "lidDc", Lid(false) },
        };
    }

    static object Lid(bool ac)
    {
        IntPtr scheme;
        if (PowerGetActiveScheme(IntPtr.Zero, out scheme) != 0) return null;
        try
        {
            Guid group = ButtonsGroup;
            Guid setting = LidAction;
            uint value;
            uint err = ac
                ? PowerReadACValueIndex(IntPtr.Zero, scheme, ref group, ref setting, out value)
                : PowerReadDCValueIndex(IntPtr.Zero, scheme, ref group, ref setting, out value);
            return err == 0 ? (object)(int)value : null;
        }
        finally
        {
            LocalFree(scheme);
        }
    }

    // Processos somados por nome. "c" é o uso de CPU desde a leitura anterior (% do total da máquina).
    static List<object> Procs()
    {
        DateTime now = DateTime.UtcNow;
        var cur = new Dictionary<int, double>();
        var agg = new Dictionary<string, Agg>();
        foreach (Process p in Process.GetProcesses())
        {
            try
            {
                if (p.Id == 0) continue;   // "Idle" não é um processo de verdade
                string name = p.ProcessName;
                double delta = 0;
                try
                {
                    double cpu = p.TotalProcessorTime.TotalSeconds;
                    cur[p.Id] = cpu;
                    double before;
                    if (prevCpu.TryGetValue(p.Id, out before) && cpu >= before) delta = cpu - before;
                }
                catch
                {
                    // Processos protegidos do sistema não deixam ler o tempo de CPU.
                }
                Agg a;
                if (!agg.TryGetValue(name, out a)) { a = new Agg(); agg[name] = a; }
                a.Count++;
                a.Cpu += delta;
                a.Memory += p.WorkingSet64;
            }
            catch
            {
                // O processo terminou no meio da leitura.
            }
            finally
            {
                p.Dispose();
            }
        }

        double elapsed = prevAt == DateTime.MinValue ? 0 : (now - prevAt).TotalSeconds;
        prevCpu = cur;
        prevAt = now;
        int threads = Environment.ProcessorCount;

        var rows = agg.Select(kv => new
        {
            Name = kv.Key,
            Count = kv.Value.Count,
            Cpu = elapsed > 0.2 ? Math.Min(100, 100 * kv.Value.Cpu / (elapsed * threads)) : 0,
            Mb = Math.Round(kv.Value.Memory / (1024.0 * 1024.0)),
        }).ToList();

        // A página mostra os 8 que mais usam CPU e os 8 que mais usam memória.
        var top = rows.OrderByDescending(r => r.Cpu).Take(8)
            .Union(rows.OrderByDescending(r => r.Mb).Take(8));
        var list = new List<object>();
        foreach (var r in top)
        {
            list.Add(new Dictionary<string, object>
            {
                { "n", r.Name }, { "k", r.Count }, { "c", Round1(r.Cpu) }, { "m", r.Mb },
            });
        }
        return list;
    }

    static List<object> Disks()
    {
        var list = new List<object>();
        foreach (DriveInfo d in DriveInfo.GetDrives())
        {
            try
            {
                if (d.DriveType != DriveType.Fixed || !d.IsReady) continue;
                list.Add(new Dictionary<string, object>
                {
                    { "name", d.Name.TrimEnd('\\') },
                    { "label", d.VolumeLabel },
                    { "freeGB", Round1(d.AvailableFreeSpace / GB) },
                    { "totalGB", Round1(d.TotalSize / GB) },
                });
            }
            catch
            {
                // Unidade sem mídia ou sem permissão.
            }
        }
        return list;
    }

    static Dictionary<string, object> Temp(string name, double celsius)
    {
        return new Dictionary<string, object> { { "name", name }, { "c", celsius } };
    }

    // Temperaturas vêm do LibreHardwareMonitor (ou OpenHardwareMonitor), se um deles estiver aberto.
    // Sem eles, tenta a zona térmica do ACPI, que só responde com privilégio de administrador.
    static List<object> ReadTemps(string ns)
    {
        var list = new List<object>();
        if (ns == @"root\wmi")
        {
            using (var search = new ManagementObjectSearcher(ns, "SELECT CurrentTemperature FROM MSAcpi_ThermalZoneTemperature"))
            {
                int i = 0;
                foreach (ManagementObject zone in search.Get())
                {
                    i++;
                    double c = Math.Round(Convert.ToDouble(zone["CurrentTemperature"]) / 10 - 273.15);
                    if (c > 0 && c < 150) list.Add(Temp("Zona térmica " + i, c));
                }
            }
            return list;
        }

        var sensors = new List<KeyValuePair<string, double>>();
        using (var search = new ManagementObjectSearcher(ns, "SELECT Name, Value, Identifier FROM Sensor WHERE SensorType = 'Temperature'"))
        {
            foreach (ManagementObject s in search.Get().Cast<ManagementObject>().OrderBy(o => Convert.ToString(o["Identifier"])))
            {
                double c = Math.Round(Convert.ToDouble(s["Value"]));
                if (c > 0 && c < 150) sensors.Add(new KeyValuePair<string, double>(Convert.ToString(s["Name"]), c));
            }
        }
        var seen = new Dictionary<string, int>();
        foreach (var s in sensors.Take(8))
        {
            int n;
            seen.TryGetValue(s.Key, out n);
            seen[s.Key] = n + 1;
            list.Add(Temp(n == 0 ? s.Key : s.Key + " " + (n + 1), s.Value));
        }
        return list;
    }

    // Leituras da tarefa de sensores (SYSTEM, install-sensores.ps1), que lê a CPU pelo driver.
    // Só valem se forem recentes: com a tarefa parada, cai no WMI abaixo.
    static List<object> SensorFile()
    {
        try
        {
            string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), @"CentralPC\sensors.json");
            var o = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(path));
            long age = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - Convert.ToInt64(o["at"]);
            if (age < -30000 || age > 30000) return null;
            return ((System.Collections.ArrayList)o["temps"]).Cast<object>().Take(8).ToList();
        }
        catch
        {
            return null;   // não instalada, sendo trocada agora ou com outro formato
        }
    }

    static List<object> Temps()
    {
        var fromFile = SensorFile();
        if (fromFile != null) return fromFile;
        if (tempNs != null)
        {
            try { return ReadTemps(tempNs); }
            catch { tempNs = null; }
        }
        // Procurar um sensor que não existe é lento: só tenta de novo a cada 5 minutos.
        if ((DateTime.UtcNow - tempProbeAt).TotalMinutes < 5) return new List<object>();
        tempProbeAt = DateTime.UtcNow;
        foreach (string ns in new[] { @"root\LibreHardwareMonitor", @"root\OpenHardwareMonitor", @"root\wmi" })
        {
            try
            {
                var found = ReadTemps(ns);
                if (found.Count > 0) { tempNs = ns; return found; }
            }
            catch
            {
                // Esse namespace não existe (ou não deixa ler): tenta o próximo.
            }
        }
        return new List<object>();
    }

    // Com a tela bloqueada, o Windows mostra o LogonUI dentro da sessão do usuário.
    static string SessionState()
    {
        Process[] logon = Process.GetProcessesByName("LogonUI");
        try
        {
            return logon.Any(p => p.SessionId == sessionId) ? "locked" : "active";
        }
        finally
        {
            foreach (Process p in logon) p.Dispose();
        }
    }

    static void SaveJpeg(Image image, string file, long quality)
    {
        ImageCodecInfo codec = ImageCodecInfo.GetImageEncoders().First(c => c.MimeType == "image/jpeg");
        using (var options = new EncoderParameters(1))
        {
            options.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);
            image.Save(file, codec, options);
        }
    }

    // Captura todos os monitores. Baixa a qualidade (e por último o tamanho) até caber no limite do servidor.
    static void Shot(string file)
    {
        Rectangle area = SystemInformation.VirtualScreen;
        using (var bitmap = new Bitmap(area.Width, area.Height))
        {
            try
            {
                using (Graphics g = Graphics.FromImage(bitmap))
                {
                    g.CopyFromScreen(area.Left, area.Top, 0, 0, bitmap.Size);
                }
            }
            catch (Exception)
            {
                throw new InvalidOperationException("Não deu para capturar a tela. Ela pode estar bloqueada.");
            }
            foreach (long quality in new long[] { 80, 65, 50, 35 })
            {
                SaveJpeg(bitmap, file, quality);
                if (new FileInfo(file).Length <= ShotLimit) return;
            }
            using (var small = new Bitmap(bitmap, area.Width / 2, area.Height / 2))
            {
                SaveJpeg(small, file, 60);
            }
            if (new FileInfo(file).Length > ShotLimit) throw new InvalidOperationException("O print ficou grande demais.");
        }
    }
}
