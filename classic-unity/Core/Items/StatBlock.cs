// 能力値のまとまり（装備・書・バフ・パッシブの足し算に使う）。
// データの JSON では { "str": 3, "watk": 17, "wdef": 2, ... } の形。
using System.Collections.Generic;
using Lumina.Core.Util;

namespace Lumina.Core.Items
{
    public sealed class StatBlock
    {
        public int Str, Dex, Int, Luk;
        public int Hp, Mp;
        public int Watk, Matk, Wdef, Mdef;
        public int Acc, Avoid, Speed, Jump;

        public static readonly string[] Keys = { "str", "dex", "int", "luk", "hp", "mp", "watk", "matk", "wdef", "mdef", "acc", "avoid", "speed", "jump" };

        public int Get(string key)
        {
            switch (key)
            {
                case "str": return Str;
                case "dex": return Dex;
                case "int": return Int;
                case "luk": return Luk;
                case "hp": return Hp;
                case "mp": return Mp;
                case "watk": return Watk;
                case "matk": return Matk;
                case "wdef": return Wdef;
                case "mdef": return Mdef;
                case "acc": return Acc;
                case "avoid": return Avoid;
                case "speed": return Speed;
                case "jump": return Jump;
                default: return 0;
            }
        }

        public void Set(string key, int v)
        {
            switch (key)
            {
                case "str": Str = v; break;
                case "dex": Dex = v; break;
                case "int": Int = v; break;
                case "luk": Luk = v; break;
                case "hp": Hp = v; break;
                case "mp": Mp = v; break;
                case "watk": Watk = v; break;
                case "matk": Matk = v; break;
                case "wdef": Wdef = v; break;
                case "mdef": Mdef = v; break;
                case "acc": Acc = v; break;
                case "avoid": Avoid = v; break;
                case "speed": Speed = v; break;
                case "jump": Jump = v; break;
            }
        }

        public void Add(StatBlock o, int times = 1)
        {
            if (o == null) return;
            Str += o.Str * times; Dex += o.Dex * times; Int += o.Int * times; Luk += o.Luk * times;
            Hp += o.Hp * times; Mp += o.Mp * times;
            Watk += o.Watk * times; Matk += o.Matk * times; Wdef += o.Wdef * times; Mdef += o.Mdef * times;
            Acc += o.Acc * times; Avoid += o.Avoid * times; Speed += o.Speed * times; Jump += o.Jump * times;
        }

        public StatBlock Clone()
        {
            var s = new StatBlock();
            s.Add(this);
            return s;
        }

        public bool IsZero
        {
            get
            {
                foreach (var k in Keys) if (Get(k) != 0) return false;
                return true;
            }
        }

        public static StatBlock FromDict(Dictionary<string, object> d)
        {
            var s = new StatBlock();
            if (d == null) return s;
            foreach (var k in Keys) if (d.ContainsKey(k)) s.Set(k, J.Int(d, k));
            return s;
        }

        public Dictionary<string, object> ToDict()
        {
            var d = new Dictionary<string, object>();
            foreach (var k in Keys) { int v = Get(k); if (v != 0) d[k] = (long)v; }
            return d;
        }

        public override string ToString() => Json.Serialize(ToDict());
    }
}
