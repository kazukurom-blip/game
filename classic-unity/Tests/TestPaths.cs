using System;
using System.IO;

namespace Lumina.Core.Tests
{
    /// <summary>テストから classic-unity/ の中のファイルを探す。</summary>
    public static class TestPaths
    {
        private static string root;

        public static string Root
        {
            get
            {
                if (root != null) return root;
                var d = new DirectoryInfo(AppContext.BaseDirectory);
                while (d != null)
                {
                    if (File.Exists(Path.Combine(d.FullName, "Directory.Build.props")) && Directory.Exists(Path.Combine(d.FullName, "Core")))
                    {
                        root = d.FullName;
                        return root;
                    }
                    d = d.Parent;
                }
                throw new DirectoryNotFoundException("classic-unity/ が見つからない");
            }
        }

        public static string Golden(string name) => Path.Combine(Root, "Tests", "Golden", name);
        public static string Data => Path.Combine(Root, "Data");

        public static string NewTempDir(string tag)
        {
            var p = Path.Combine(Path.GetTempPath(), "lumina-tests", tag + "-" + Guid.NewGuid().ToString("N").Substring(0, 8));
            Directory.CreateDirectory(p);
            return p;
        }
    }
}
