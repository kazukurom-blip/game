// ゲームのデータ（Data/*.json）を読み込んで持っておく所。
// Unity 側は IDataSource を作って渡すだけ（Resources の TextAsset、StreamingAssets のファイル、どちらでもよい）。
// 例: var data = GameData.Load(new FileDataSource(Application.streamingAssetsPath + "/Lumina"));
using System;
using System.Collections.Generic;
using System.IO;
using Lumina.Core.Items;
using Lumina.Core.Mobs;
using Lumina.Core.Quests;
using Lumina.Core.Skills;
using Lumina.Core.Town;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Data
{
    /// <summary>データのファイルを読む口。path は Data/ からの相対（例 "items.json", "maps/S001.json"）。無ければ null。</summary>
    public interface IDataSource
    {
        string ReadText(string path);
    }

    /// <summary>ふつうのファイルから読む（テスト・StreamingAssets 用）。</summary>
    public sealed class FileDataSource : IDataSource
    {
        private readonly string root;
        public FileDataSource(string root) { this.root = root; }
        public string ReadText(string path)
        {
            var p = Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar));
            return File.Exists(p) ? File.ReadAllText(p) : null;
        }
    }

    /// <summary>メモリの中の文字列から読む（Unity の TextAsset をまとめて渡す時など）。</summary>
    public sealed class DictDataSource : IDataSource
    {
        public readonly Dictionary<string, string> Files = new Dictionary<string, string>();
        public string ReadText(string path) => Files.TryGetValue(path, out var s) ? s : null;
    }

    public sealed class ShopEntry { public string Item; public long Price; public int Bundle = 1; }
    public sealed class ShopDef
    {
        public string Id, Name;
        public readonly List<ShopEntry> Items = new List<ShopEntry>();
        /// <summary>日替わり（にぎわい市場）: Items の中からこの数を日付で選んで並べる。0 = いつも全部</summary>
        public int Daily;
        /// <summary>投げ星・弾の詰め直しができる（新品の値段の 1/2）</summary>
        public bool Recharge;
    }

    public sealed class NpcDef
    {
        public string Id, Name, Map, Shop;
        public double X;
        /// <summary>話しかけた時のセリフ（npc_lines.mjs → npcs.json の lines）。先頭の [条件] は NpcLines.cs</summary>
        public readonly List<string> Lines = new List<string>();
    }

    public sealed class GameData
    {
        public readonly Dictionary<string, ItemDef> Items = new Dictionary<string, ItemDef>();
        public readonly Dictionary<string, MobDef> Mobs = new Dictionary<string, MobDef>();
        public readonly Dictionary<string, SkillDef> Skills = new Dictionary<string, SkillDef>();
        public readonly List<SkillDef> SkillList = new List<SkillDef>();
        public readonly Dictionary<string, QuestDef> Quests = new Dictionary<string, QuestDef>();
        public readonly List<QuestDef> QuestList = new List<QuestDef>();
        public readonly Dictionary<string, ShopDef> Shops = new Dictionary<string, ShopDef>();
        public readonly Dictionary<string, NpcDef> Npcs = new Dictionary<string, NpcDef>();
        public readonly List<string> MapIds = new List<string>();
        /// <summary>町と成長の仕組み（systems.json: 倉庫・部屋の決まり・ペット・製作・クイズ・転職の試験）。無ければ空</summary>
        public SystemsData Systems = new SystemsData();
        /// <summary>全体マップ（worldmap.json。無ければ空）</summary>
        public WorldMapData WorldMap = new WorldMapData();
        /// <summary>楽しさの要素（fun.json: 景品の機械・フィールドボス・船の旅・遊び場など。Core/Fun）。無ければ空</summary>
        public Lumina.Core.Fun.FunData Fun = new Lumina.Core.Fun.FunData();
        private readonly Dictionary<string, MapData> maps = new Dictionary<string, MapData>();
        private IDataSource source;

        public static GameData Load(IDataSource src)
        {
            var g = new GameData { source = src };
            foreach (var o in J.Arr(Read(src, "items.json"), "items"))
            {
                var it = ItemDef.FromDict((Dictionary<string, object>)o);
                g.Items[it.Id] = it;
            }
            foreach (var o in J.Arr(Read(src, "monsters.json"), "monsters"))
            {
                var m = MobDef.FromDict((Dictionary<string, object>)o);
                g.Mobs[m.Id] = m;
            }
            foreach (var o in J.Arr(Read(src, "skills.json"), "skills"))
            {
                var s = SkillDef.FromDict((Dictionary<string, object>)o);
                g.Skills[s.Id] = s;
                g.SkillList.Add(s);
            }
            foreach (var o in J.Arr(Read(src, "quests.json"), "quests"))
            {
                var q = QuestDef.FromDict((Dictionary<string, object>)o);
                g.Quests[q.Id] = q;
                g.QuestList.Add(q);
            }
            foreach (var o in J.Arr(Read(src, "shops.json"), "shops"))
            {
                var d = (Dictionary<string, object>)o;
                var shop = new ShopDef { Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Daily = J.Int(d, "daily"), Recharge = J.Bool(d, "recharge") };
                foreach (var e in J.Arr(d, "items"))
                {
                    var ed = (Dictionary<string, object>)e;
                    var id = J.Str(ed, "item");
                    g.Items.TryGetValue(id, out var def);
                    shop.Items.Add(new ShopEntry
                    {
                        Item = id,
                        Price = J.Has(ed, "price") ? J.Long(ed, "price") : def?.Price ?? 0,
                        Bundle = J.Has(ed, "bundle") ? J.Int(ed, "bundle") : (def != null && def.AmmoKind != null ? def.MaxStack : 1),
                    });
                }
                g.Shops[shop.Id] = shop;
            }
            var npcs = src.ReadText("npcs.json");
            if (npcs != null)
            {
                foreach (var o in J.Arr(Json.ParseObject(npcs), "npcs"))
                {
                    var d = (Dictionary<string, object>)o;
                    var n = new NpcDef { Id = J.Str(d, "id"), Name = J.Str(d, "name", ""), Map = J.Str(d, "map"), Shop = J.Str(d, "shop"), X = J.Num(d, "x") };
                    foreach (var l in J.Arr(d, "lines")) if (l is string ls) n.Lines.Add(ls);
                    g.Npcs[n.Id] = n;
                }
            }
            var sys = src.ReadText("systems.json");
            if (sys != null) g.Systems = SystemsData.FromDict(Json.ParseObject(sys));
            var wm = src.ReadText("worldmap.json");
            if (wm != null) g.WorldMap = WorldMapData.FromDict(Json.ParseObject(wm));
            var fun = src.ReadText("fun.json");
            if (fun != null) g.Fun = Lumina.Core.Fun.FunData.FromDict(Json.ParseObject(fun));
            var idx = src.ReadText("maps/index.json");
            if (idx != null) foreach (var o in J.Arr(Json.ParseObject(idx), "maps")) g.MapIds.Add(J.Str((Dictionary<string, object>)o, "id"));
            return g;
        }

        private static Dictionary<string, object> Read(IDataSource src, string path)
        {
            var t = src.ReadText(path);
            if (t == null) throw new FileNotFoundException("データが無い: " + path);
            return Json.ParseObject(t);
        }

        /// <summary>マップは使う時に読む（一度読んだら覚えておく）。無ければ null。</summary>
        public MapData GetMap(string id)
        {
            if (id == null) return null;
            if (maps.TryGetValue(id, out var m)) return m;
            var t = source?.ReadText("maps/" + id + ".json");
            if (t == null) return null;
            m = MapData.FromJson(t);
            // セリフは npcs.json が持つ（マップの JSON に無ければ写す）
            foreach (var n in m.Npcs)
                if (n.Lines.Count == 0 && Npcs.TryGetValue(n.Id, out var def)) n.Lines.AddRange(def.Lines);
            maps[id] = m;
            return m;
        }

        /// <summary>テスト用: マップを直接登録する。</summary>
        public void AddMap(MapData m) { maps[m.Id] = m; if (!MapIds.Contains(m.Id)) MapIds.Add(m.Id); }

        public ItemDef Item(string id)
        {
            if (id != null && Items.TryGetValue(id, out var it)) return it;
            return null;
        }

        public MobDef Mob(string id) => id != null && Mobs.TryGetValue(id, out var m) ? m : null;
        public SkillDef Skill(string id) => id != null && Skills.TryGetValue(id, out var s) ? s : null;
        public QuestDef Quest(string id) => id != null && Quests.TryGetValue(id, out var q) ? q : null;

        /// <summary>その Lv 帯の装備（ドロップ用）。</summary>
        public List<ItemDef> EquipsOfBand(int band)
        {
            var r = new List<ItemDef>();
            foreach (var it in Items.Values)
                if (it.IsEquip && it.ReqLevel == band && it.Price > 0 && !it.Id.StartsWith("eq.starter.", StringComparison.Ordinal)) r.Add(it);
            r.Sort((a, b) => string.CompareOrdinal(a.Id, b.Id));
            return r;
        }

        private List<ItemDef> cursedScrolls;
        public List<ItemDef> CursedScrolls()
        {
            if (cursedScrolls != null) return cursedScrolls;
            cursedScrolls = new List<ItemDef>();
            foreach (var it in Items.Values) if (it.Scroll != null && it.Scroll.Cursed) cursedScrolls.Add(it);
            cursedScrolls.Sort((a, b) => string.CompareOrdinal(a.Id, b.Id));
            return cursedScrolls;
        }
    }
}
