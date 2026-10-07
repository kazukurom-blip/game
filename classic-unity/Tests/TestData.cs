using Lumina.Core.Data;

namespace Lumina.Core.Tests
{
    /// <summary>classic-unity/Data の本物のデータを読む（テストの間は 1 回だけ）。</summary>
    public static class TestData
    {
        private static GameData data;
        private static readonly object gate = new object();

        public static GameData Get()
        {
            lock (gate)
            {
                return data ??= GameData.Load(new FileDataSource(TestPaths.Data));
            }
        }

        /// <summary>書き換えるテスト用に、毎回新しく読む。</summary>
        public static GameData Fresh() => GameData.Load(new FileDataSource(TestPaths.Data));
    }
}
