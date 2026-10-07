// ゲームの 1 人分の状態と、1/60 秒ごとの更新。Unity 側はこれを 1 つ作って、毎フレーム Update を呼ぶだけ。
//
//   var data = GameData.Load(new FileDataSource(path));
//   var session = GameSession.NewGame(data, "なまえ", seed: 12345);       // または GameSession.Load(data, store, "char1")
//   session.AttachSave(new SaveStore(new DiskFileSystem(), saveDir), "char1");
//   // 毎フレーム:
//   session.Update(Time.deltaTime, input);   // 中で 60 回/秒の固定の更新を必要な回数だけ回す
//   // 描く: session.Body（位置・状態）、session.Pose（動きの名前とコマ）、session.Map.Mobs / Drops、
//   //       session.Out.Damage（ダメージの数字）、session.Out.Events（音・メッセージ）
//
// このファイル: 作る・読む・1 フレームの流れ・マップ移動・自然回復・死んだ時・セーブ。
// 攻撃とスキルは GameSession.Combat.cs、アイテムと店は GameSession.Items.cs、NPC とクエストは GameSession.Quests.cs。
// 町の仕組み（倉庫・タクシー・製作・椅子）は GameSession.Town.cs、転職の試験は GameSession.Jobs.cs、
// ボスの間・ダンジョン・試験の部屋は GameSession.Rooms.cs、ペットは GameSession.Pets.cs。
using System;
using System.Collections.Generic;
using Lumina.Core.Character;
using Lumina.Core.Combat;
using Lumina.Core.Data;
using Lumina.Core.Items;
using Lumina.Core.Physics;
using Lumina.Core.Quests;
using Lumina.Core.Save;
using Lumina.Core.Skills;
using Lumina.Core.Status;
using Lumina.Core.Town;
using Lumina.Core.Util;
using Lumina.Core.World;

namespace Lumina.Core.Game
{
    public sealed class QuickSlot { public string Kind; public string Id; } // Kind: "skill" / "item"

    public sealed partial class GameSession
    {
        public const string StartMap = "S000";
        public const int QuickSlotCount = 16;

        public readonly GameData Data;
        public readonly CharacterState Character = new CharacterState();
        public readonly Inventory Inventory;
        public readonly Equipment Equipment;
        public readonly SkillBook Skills;
        public readonly BuffSet Buffs = new BuffSet();
        public readonly QuestLog Quests;
        public readonly EventQueue Out = new EventQueue();
        public readonly FixedStepper Stepper = new FixedStepper();
        public readonly AutoSaver AutoSave = new AutoSaver();
        public readonly QuickSlot[] QuickSlots = new QuickSlot[QuickSlotCount];
        public readonly Dictionary<string, bool> Flags = new Dictionary<string, bool>();
        public Rng Rng;

        public PlayerBody Body;
        public MapInstance Map;
        public AttackAction Attack;
        public FinalStats Stats;
        public AvatarPose Pose;
        public bool Dead;
        public double PlaySec;
        /// <summary>1 つ前の固定の更新の時の足元の位置（描く時の補間: Lerp(Prev, 今, Stepper.Alpha)）</summary>
        public double PrevX, PrevY;

        public SaveStore Store { get; private set; }
        public string Slot { get; private set; }
        public Func<DateTime> Clock = () => DateTime.UtcNow;
        /// <summary>隠しクエストの「時間」を決める時差（時間）。既定は日本の時間（UTC+9）</summary>
        public double HourOffset = 9;

        private PlayerInput input;
        private bool prevJump;
        private readonly PoseTracker poseTracker = new PoseTracker();
        private double regenT, ropeRegenT, pickupT;

        private GameSession(GameData data, ulong seed)
        {
            Data = data;
            Inventory = new Inventory(data.Item);
            Inventory.ExtraStack = d => d.AmmoKind == "star" ? (Stats?.Mods.StarBundle ?? 0) : 0; // クローの熟練: 投げ星の 1 束 +
            Equipment = new Equipment(data.Item);
            Skills = new SkillBook(data);
            Quests = new QuestLog(data);
            Quests.RepeatReady = q => Daily.Used(RepeatKey(q), Clock(), q.Weekly) == 0;
            Quests.Offered = q => BoardToday().Contains(q.Id);
            Quests.HourNow = () => Clock().AddHours(HourOffset).Hour;   // 隠しクエストの時間（QUESTS.md 8 章）
            Quests.HasItem = HasOrWears;                               // 隠しクエストの「持って話す」品（着けていてもよい）
            Rng = new Rng(seed);
        }

        // ---------------- 作る・読む

        /// <summary>新しいキャラ。能力値はサイコロ（合計 25）。初期装備（白いシャツ・青い半ズボン・革のサンダル・木の剣）を着て目覚めの浜から。</summary>
        public static GameSession NewGame(GameData data, string name, ulong seed)
        {
            var s = new GameSession(data, seed);
            s.Character.Name = name;
            s.Character.RollStats(s.Rng);
            foreach (var id in new[] { "eq.starter.2", "eq.starter.3", "eq.starter.6", "eq.starter.9" })
            {
                if (data.Item(id) == null) continue;
                s.Inventory.Add(id);
                for (int i = 0; i < s.Inventory.SlotCount(InvTab.Equip); i++)
                    if (s.Inventory.Get(InvTab.Equip, i)?.ItemId == id) { s.Equipment.EquipFromInventory(s.Inventory, i, s.Character); break; }
            }
            s.RefreshStats();
            s.Character.Hp = s.Stats.MaxHp; s.Character.Mp = s.Stats.MaxMp;
            s.EnterMap(StartMap, null, true);
            s.Out.Clear();
            return s;
        }

        /// <summary>セーブから続きを始める（壊れていたらバックアップから）。読めなければ null（result に理由）。</summary>
        public static GameSession Load(GameData data, SaveStore store, string slot, out LoadResult result)
        {
            result = store.Load(slot);
            if (!result.Ok) return null;
            var s = FromSave(data, result.Data);
            s.AttachSave(store, slot);
            if (result.Recovered) s.Out.Add(GameEventType.Message, text: "セーブが壊れていたので、" + result.Source + " から戻した");
            return s;
        }

        /// <summary>セーブの場所を決める。キャラ全員で共有する倉庫（"account" の枠）もここで読む。</summary>
        public void AttachSave(SaveStore store, string slot) { Store = store; Slot = slot; LoadAccount(); }

        // ---------------- 1 フレーム

        /// <summary>毎フレーム呼ぶ。realDt 秒ぶん、1/60 秒の固定の更新を回す。Out は最初に空になる。</summary>
        public void Update(double realDt, PlayerInput frameInput)
        {
            Out.Clear();
            // 押している物は今の値、押した瞬間の物は Core が読むまで覚えておく
            input.Left = frameInput.Left; input.Right = frameInput.Right; input.Up = frameInput.Up; input.Down = frameInput.Down;
            input.Jump = frameInput.Jump; input.Attack = frameInput.Attack; input.Pickup = frameInput.Pickup;
            input.SkillHeld = frameInput.SkillHeld;
            input.JumpPressed |= frameInput.JumpPressed;
            input.UpPressed |= frameInput.UpPressed;
            input.InteractPressed |= frameInput.InteractPressed;
            if (frameInput.SkillPressed != null) input.SkillPressed = frameInput.SkillPressed;
            if (frameInput.ItemPressed != null) input.ItemPressed = frameInput.ItemPressed;
            Stepper.Advance(realDt, StepFixed);
        }

        /// <summary>テスト・道具用: 固定の更新を n 回まわす（Out は空にしない）。</summary>
        public void Step(PlayerInput frameInput, int frames = 1)
        {
            for (int i = 0; i < frames; i++)
            {
                input = frameInput;
                if (i > 0) { input.JumpPressed = false; input.UpPressed = false; input.InteractPressed = false; input.SkillPressed = null; input.ItemPressed = null; }
                StepFixed(Feel.Dt);
            }
        }

        private void StepFixed(double dt)
        {
            PrevX = Body.X; PrevY = Body.Y;
            PlaySec += dt;
            RefreshStats();
            var inp = input;
            input.ConsumePressed();
            if (Status.Confused) { bool l = inp.Left; inp.Left = inp.Right; inp.Right = l; } // 錯乱: 左右が逆

            if (Dead)
            {
                TickCollection(dt);
                Map.StepWorld(dt, Rng);
                StepMobs(dt);
                Pose = poseTracker.Update(Body, null, true, dt, 0);
                TickAutoSave(dt);
                return;
            }

            PreStepTown(ref inp);
            if (inp.ItemPressed != null) UseItem(inp.ItemPressed);
            skillInput = inp;
            if (inp.SkillPressed != null) UseSkill(inp.SkillPressed);
            // 攻撃スキルのキーを押しっぱなし: 終わるたびにくり返す（嵐の連射・弾幕も）
            else if (inp.SkillHeld != null && Attack == null && Data.Skill(inp.SkillHeld)?.IsAttack == true) UseSkill(inp.SkillHeld, true);
            if (inp.InteractPressed && !TryFillRift()) InteractNearby();

            // ポータル: ↑を押した瞬間、足元にポータルがあれば入る（縄より先）
            if (inp.UpPressed && !Body.OnRope)
            {
                if (Status.CanMove && TryUseDoor()) { Pose = poseTracker.Update(Body, Attack, Dead, dt, Status.Mask); return; } // 秘術の扉
                var p = Map.Data.FindPortalAt(Body.X, Body.Y);
                if (p != null && Status.CanMove && UsePortal(p)) { Pose = poseTracker.Update(Body, Attack, Dead, dt, Status.Mask); return; }
            }

            // ふつうの攻撃（押している間くり返す）
            if (inp.Attack && Attack == null) StartBasicAttack();

            // 物理（気絶・凍結・眠りの間は入力が効かない。弱りはジャンプだけできない）
            Body.AttackLock = Attack != null && Attack.OnGround && !Attack.Finished;
            if (Attack != null && Attack.Dashing) { Body.AttackLock = false; if (Body.OnGround) Body.Vx = Attack.Facing * Attack.DashSpeed; } // 突進
            Body.NoJump = !Status.CanJump;
            Body.SlowFall = Buffs.SlowFall; // 隠れ足
            var pin = new PhysicsInput
            {
                Left = inp.Left, Right = inp.Right, Up = inp.Up, Down = inp.Down, Jump = inp.Jump,
                JumpPressed = inp.JumpPressed || (inp.Jump && !prevJump),
            };
            if (!Status.CanMove) pin = PhysicsInput.None;
            prevJump = inp.Jump;
            PlayerPhysics.Step(Body, pin, Map.Physics, dt);
            foreach (var e in Body.Events) Out.Add(ToEventType(e), x: Body.X, y: Body.Y);
            if (Body.Y > Map.Data.Height + 150) // マップの下へ落ちた（足場の作りの間違いの保険）
            {
                var sp = Map.Data.SpawnPoint();
                PlayerPhysics.PlaceOnGround(Body, Map.Physics, sp.x, sp.y);
            }

            // 攻撃の当たる瞬間
            if (Attack != null)
            {
                if (Attack.Advance(dt)) ResolveAttackHit();
                if (Attack != null && Attack.Finished) Attack = null;
            }
            TickPendingHits(dt);

            StepMobs(dt);
            TickMechanics(dt);
            Map.StepWorld(dt, Rng);

            pickupT -= dt;
            if (inp.Pickup && pickupT <= 0) { if (TryPickup()) pickupT = 0.1; }

            TickBuffs(dt);
            TickPlayerStatus(dt);
            Skills.Tick(dt);
            Regen(dt);
            TickTown(dt); // ペット・部屋の制限時間（GameSession.Town.cs）
            TickCollection(dt); // 勲章の判定・記録（GameSession.Collection.cs）

            Pose = poseTracker.Update(Body, Attack, Dead, dt, Status.Mask);
            if (Sitting != null) Pose.Motion = "sit";
            TickAutoSave(dt);
        }

        private static GameEventType ToEventType(BodyEvent e)
        {
            switch (e)
            {
                case BodyEvent.Jump: return GameEventType.Jump;
                case BodyEvent.Land: return GameEventType.Land;
                case BodyEvent.Grab: return GameEventType.Grab;
                case BodyEvent.DownJump: return GameEventType.DownJump;
                case BodyEvent.RopeJump: return GameEventType.RopeJump;
                default: return GameEventType.Hurt;
            }
        }

        /// <summary>最終の能力を計算し直す（装備・バフ・AP・スキルが変わった時。毎フレームも呼ばれる）。</summary>
        public void RefreshStats()
        {
            Stats = StatCalc.Compute(Character, Equipment, Skills, Buffs, Inventory, Data, CollectionBonus()); // 図鑑の段の上乗せ（GameSession.Collection.cs）
            if (Status.Any)
            {
                // 暗闇: 命中 −50%。呪い: 攻撃力・魔力・防御 −20%（STATS.md 4-3）
                Stats.Acc *= Status.AccMul;
                double cm = Status.AtkMul;
                if (cm < 1)
                {
                    Stats.Watk = (int)Math.Floor(Stats.Watk * cm);
                    Stats.MagicPower = (int)Math.Floor(Stats.MagicPower * cm);
                    Stats.Wdef = (int)Math.Floor(Stats.Wdef * cm);
                    Stats.Mdef = (int)Math.Floor(Stats.Mdef * cm);
                }
                // 遅延: 速さ −power（SlowMinSpeed より下げない）
                double sd = Status.SpeedDown;
                if (sd > 0) Stats.Speed = Math.Max(SlowMinSpeed, Stats.Speed - (int)Math.Round(sd));
            }
            if (Body != null) Body.SetMoveStats(Stats.Speed, Stats.Jump);
            if (Character.Hp > Stats.MaxHp) Character.Hp = Stats.MaxHp;
            if (Character.Mp > Stats.MaxMp) Character.Mp = Stats.MaxMp;
        }

        public Rect PlayerBox => new Rect(Body.X - PlayerBody.HalfW, Body.Y - PlayerBody.Height, Body.X + PlayerBody.HalfW, Body.Y);

        // ---------------- マップ

        private void EnterMap(string mapId, string portalName, bool first)
        {
            var md = Data.GetMap(mapId);
            if (md == null)
            {
                Out.Add(GameEventType.Message, mapId, text: "マップ " + mapId + " が無い");
                if (Map != null) return;
                md = Data.GetMap(StartMap);
            }
            bool sameMap = Map != null && Map.Data.Id == md.Id;
            if (Map != null) BeforeEnterMap(md);
            Sitting = null;
            Map = GetOrCreateMap(md);
            var (x, y) = portalName != null && md.FindPortalByName(portalName) != null ? PortalPos(md, portalName) : md.SpawnPoint();
            if (Body == null) Body = new PlayerBody(x, y);
            PlayerPhysics.PlaceOnGround(Body, Map.Physics, x, y);
            PrevX = Body.X; PrevY = Body.Y; // マップをまたいで補間しない
            Body.InvT = 0; Body.Events.Clear();
            Attack = null;
            Zones.Clear(); // 毒の霧はそのマップに置いた物
            RefreshStats();
            if (!first)
            {
                Out.Add(GameEventType.MapChanged, md.Id, text: md.Name);
                AutoSave.Request("map");
            }
            AfterEnterMap(md, sameMap && !first);
            foreach (var pet in Pets) { pet.X = Body.X; pet.Y = Body.Y; }
            OnVisitMap(md.Id);
        }

        // 最近いたマップはそのまま残す（離れて戻っても、削った強敵の HP・落ちている物はそのまま。クラシックのマップと同じ）
        public const int MapCacheSize = 6;
        private readonly List<MapInstance> mapCache = new List<MapInstance>();

        private MapInstance GetOrCreateMap(MapData md)
        {
            var m = mapCache.Find(x => x.Data.Id == md.Id);
            if (m != null)
            {
                mapCache.Remove(m);
                m.OnReenter(Rng);
            }
            else
            {
                m = new MapInstance(md, Data);
                m.QuestActive = q => Quests.Status(q) == QuestStatus.InProgress; // クエスト専用の敵（QUESTS.md 8 章）
                m.InitialSpawn(Rng);
            }
            mapCache.Insert(0, m);
            if (mapCache.Count > MapCacheSize) mapCache.RemoveAt(mapCache.Count - 1);
            return m;
        }

        private static (double, double) PortalPos(MapData md, string name)
        {
            var p = md.FindPortalByName(name);
            return (p.X, p.Y);
        }

        /// <summary>マップを移る（ポータル・乗り物・帰還の書・死んだ後）。</summary>
        public void ChangeMap(string mapId, string portalName = null) => EnterMap(mapId, portalName, false);

        /// <summary>ポータルに入る。入れたら true。</summary>
        public bool UsePortal(PortalData p)
        {
            if (p.RequiresQuest != null && Quests.Status(p.RequiresQuest) == QuestStatus.None)
            {
                Out.Add(GameEventType.Message, text: "今は入れない");
                return false;
            }
            if (p.To != null && !CheckRoomEntry(p.To)) return false; // ボスの間・ダンジョン・試験の部屋（GameSession.Rooms.cs）
            Out.Add(GameEventType.PortalUsed, p.Name, x: p.X, y: p.Y);
            if (p.Type == PortalType.Hidden) OnHiddenPortal(p); // 隠し部屋の記録（GameSession.Collection.cs）
            if (p.To == null)
            {
                // 同じマップの中の別の位置（隠し部屋など）
                var dst = Map.Data.FindPortalByName(p.ToPortal);
                if (dst == null) return false;
                PlayerPhysics.PlaceOnGround(Body, Map.Physics, dst.X, dst.Y);
                PrevX = Body.X; PrevY = Body.Y;
                return true;
            }
            ChangeMap(p.To, p.ToPortal);
            return true;
        }

        // ---------------- 自然回復・バフ

        private void Regen(double dt)
        {
            bool still = Body.State == BodyState.Stand && Attack == null;
            if (still)
            {
                regenT += dt;
                double interval = Map.Data.IsTown ? 5 : 10;
                if (regenT >= interval)
                {
                    regenT = 0;
                    double mul = RegenMul; // 椅子に座っていると 1.5 倍
                    Character.Hp = Math.Min(Stats.MaxHp, Character.Hp + (int)Math.Round(Stats.HpRegen * mul));
                    Character.Mp = Math.Min(Stats.MaxMp, Character.Mp + (int)Math.Round(Stats.MpRegen * mul));
                }
            }
            else regenT = 0;
            if (Body.OnRope && Stats.RopeRegenInterval > 0)
            {
                ropeRegenT += dt;
                if (ropeRegenT >= Stats.RopeRegenInterval)
                {
                    ropeRegenT = 0;
                    Character.Hp = Math.Min(Stats.MaxHp, Character.Hp + Stats.HpRegen);
                }
            }
            else ropeRegenT = 0;
        }

        private void TickBuffs(double dt)
        {
            TickSummons(dt);
            var r = Buffs.Tick(dt);
            if (r.HealHp > 0) HealHp(r.HealHp);
            if (r.LoseHp > 0) LoseHpFromBuff(r.LoseHp);
            if (r.Expired != null)
            {
                foreach (var id in r.Expired)
                {
                    Out.Add(GameEventType.BuffEnded, id);
                    if (id == StatCalc.EnergyBuffId) Energy = 0; // 気合いの満タンが切れた
                }
                RefreshStats();
            }
        }

        public void HealHp(int amount)
        {
            if (amount <= 0 || Dead) return;
            int before = Character.Hp;
            Character.Hp = Math.Min(Stats.MaxHp, Character.Hp + amount);
            Out.Damage.Add(new DamageNumber { Kind = DamageKind.Heal, Value = Character.Hp - before, X = Body.X, Y = Body.Y - PlayerBody.Height });
            Out.Add(GameEventType.Healed, value: Character.Hp - before);
        }

        public void HealMp(int amount)
        {
            if (amount <= 0 || Dead) return;
            int before = Character.Mp;
            Character.Mp = Math.Min(Stats.MaxMp, Character.Mp + amount);
            Out.Damage.Add(new DamageNumber { Kind = DamageKind.MpHeal, Value = Character.Mp - before, X = Body.X, Y = Body.Y - PlayerBody.Height });
        }

        // ---------------- 死んだ時

        private void Die()
        {
            // 復活（ビショップ）: かけておくと一度だけその場で HP 50% で起き上がる
            var rv = Buffs.ReviveBuff;
            if (rv != null)
            {
                Buffs.Remove(rv.Id);
                Character.Hp = Math.Max(1, Stats.MaxHp / 2);
                Out.Add(GameEventType.Revived, rv.Id, x: Body.X, y: Body.Y, text: "復活した");
                return;
            }
            Dead = true;
            Records.Deaths++;
            StandUp();
            Quiz = null;
            Character.Hp = 0;
            Attack = null;
            Body.Vx = 0;
            Buffs.Clear();
            Status.Clear();
            Out.Add(GameEventType.Died, Map.Data.Id, x: Body.X, y: Body.Y);
        }

        /// <summary>
        /// 倒れた後、近くの町で起き上がる（HP 50%）。経験値を失う（STATS.md 6-2）: 1 次以上は 10%（町では 1%）。
        /// 守りのお守りを持っていれば 1 つ使って失わない。
        /// </summary>
        public long Revive()
        {
            if (!Dead) return 0;
            bool safe = Map.Data.IsTown || InDungeon; // 町・1 人用ダンジョンの中は 1%
            bool charm = Character.Tier > 0 && Inventory.Has("use.safety_charm");
            if (charm) Inventory.Remove("use.safety_charm");
            long lost = Character.ApplyDeath(safe, charm);
            Dead = false;
            string town = RoomReviveMap() ?? Map.Data.ReturnMap ?? StartMap; // ボスの間などの中なら戻り先（GameSession.Rooms.cs）
            Character.Hp = Math.Max(1, Stats.MaxHp / 2);
            ChangeMap(town, Data.GetMap(town)?.FindPortalByName("town") != null ? "town" : null);
            Out.Add(GameEventType.Revived, value: lost, text: charm ? "守りのお守りが代わりに砕けた" : (lost > 0 ? "経験値を " + lost + " 失った" : null));
            AutoSave.Request("revive");
            return lost;
        }

        // ---------------- セーブ

        private void TickAutoSave(double dt)
        {
            if (Store == null) return;
            var reason = AutoSave.Tick(dt);
            if (reason != null) SaveNow(reason);
        }

        /// <summary>今すぐ保存する（自動セーブもここを通る）。</summary>
        public SaveResult SaveNow(string reason = "manual")
        {
            if (Store == null) return new SaveResult { Ok = false, Error = "セーブの場所が決まっていない" };
            // 倉庫（キャラ全員で共有）を先に保存する（途中で落ちても品が消えない向き: 両方にある方へ倒れる）
            var acc = SaveAccount();
            if (acc != null && !acc.Ok) Out.Add(GameEventType.SaveFailed, AccountData.Slot, text: acc.Error);
            var r = Store.Save(Slot, ToSaveData(reason));
            AutoSave.MarkSaved();
            Out.Add(r.Ok ? GameEventType.Saved : GameEventType.SaveFailed, reason, r.Seq, text: r.Ok ? null : r.Error);
            return r;
        }

        public SaveData ToSaveData(string reason)
        {
            var s = new SaveData
            {
                SavedAt = Clock().ToString("yyyy-MM-ddTHH:mm:ssZ", System.Globalization.CultureInfo.InvariantCulture),
                PlaySec = PlaySec, Reason = reason,
                Name = Character.Name, Line = Character.Line, Tier = Character.Tier, Branch = Character.Branch,
                Level = Character.Level, Exp = Character.Exp,
                Str = Character.Str, Dex = Character.Dex, Int = Character.Int, Luk = Character.Luk, Ap = Character.Ap,
                Sp = (int[])Character.Sp.Clone(),
                BaseMaxHp = Character.BaseMaxHp, BaseMaxMp = Character.BaseMaxMp,
                Hp = Dead ? Math.Max(1, Stats.MaxHp / 2) : Character.Hp, Mp = Character.Mp,
                ApHp = Character.ApHpCount, ApMp = Character.ApMpCount,
                Meso = Inventory.Meso,
                Map = Map.Data.Id, X = Body.X, Y = Body.Y,
                Rng0 = SaveSerializer.UlongToHex(Rng.State0), Rng1 = SaveSerializer.UlongToHex(Rng.State1),
            };
            for (int t = 0; t < 5; t++) s.Slots[t] = Inventory.SlotCount((InvTab)t);
            foreach (var (tab, slot, it) in Inventory.All()) s.Items.Add(ToSaved(it, (int)tab, slot));
            foreach (var kv in Equipment.All) s.Equipment[ItemEnums.SlotKey(kv.Key)] = ToSaved(kv.Value, 0, 0);
            foreach (var kv in Skills.Levels) s.Skills[kv.Key] = kv.Value;
            foreach (var kv in Skills.Cooldowns) s.Cooldowns[kv.Key] = kv.Value;
            foreach (var kv in Skills.Masters) s.SkillMasters[kv.Key] = kv.Value;
            for (int i = 0; i < QuickSlots.Length; i++) if (QuickSlots[i] != null) s.QuickSlots.Add(new SavedQuickSlot { Key = i, Kind = QuickSlots[i].Kind, Id = QuickSlots[i].Id });
            foreach (var kv in Quests.Entries)
            {
                var q = new SavedQuest { Id = kv.Key, Status = kv.Value.Status == QuestStatus.Completed ? "done" : "active", At = kv.Value.CompletedAtPlaySec };
                foreach (var c in kv.Value.Counts) q.Counts[c.Key] = c.Value;
                s.Quests.Add(q);
            }
            foreach (var kv in Flags) s.Flags[kv.Key] = kv.Value;
            // 死んでいる時は、起き上がる町に置いておく（読み込んだら町から）
            if (Dead) { s.Map = CurrentRoom?.Exit ?? Map.Data.ReturnMap ?? StartMap; var md = Data.GetMap(s.Map); var p = md?.FindPortalByName("town"); s.X = p?.X ?? 0; s.Y = p?.Y ?? 0; }
            WriteTownSave(s); // 倉庫以外の町の仕組み（毎日の回数・ペット）
            s.Collection = CollectionToDict(); // 図鑑・勲章・記録・見た目（版 4）
            return s;
        }

        private static SavedItem ToSaved(ItemInstance it, int tab, int slot) => new SavedItem
        {
            Tab = tab, Slot = slot, Id = it.ItemId, Count = it.Count, Stats = it.Stats?.Clone(), UpgLeft = it.UpgradesLeft, Upg = it.Upgraded, Quality = it.Quality,
        };

        private static ItemInstance FromSaved(SavedItem s) => new ItemInstance
        {
            ItemId = s.Id, Count = s.Count, Stats = s.Stats?.Clone(), UpgradesLeft = s.UpgLeft, Upgraded = s.Upg, Quality = s.Quality,
        };

        public static GameSession FromSave(GameData data, SaveData s)
        {
            ulong r0 = SaveSerializer.HexToUlong(s.Rng0), r1 = SaveSerializer.HexToUlong(s.Rng1);
            var g = new GameSession(data, 1);
            if (r0 != 0 || r1 != 0) g.Rng.SetState(r0, r1);
            var c = g.Character;
            c.Name = s.Name; c.Line = s.Line ?? JobLine.Beginner; c.Tier = s.Tier; c.Branch = s.Branch; c.Level = s.Level; c.Exp = s.Exp;
            c.Str = s.Str; c.Dex = s.Dex; c.Int = s.Int; c.Luk = s.Luk; c.Ap = s.Ap;
            Array.Copy(s.Sp, c.Sp, Math.Min(5, s.Sp.Length));
            c.BaseMaxHp = s.BaseMaxHp; c.BaseMaxMp = s.BaseMaxMp; c.Hp = s.Hp; c.Mp = s.Mp; c.ApHpCount = s.ApHp; c.ApMpCount = s.ApMp;
            g.PlaySec = s.PlaySec;
            for (int t = 0; t < 5; t++) g.Inventory.SetSlotCount((InvTab)t, s.Slots[t]);
            g.Inventory.Meso = s.Meso;
            var lost = new List<string>();
            foreach (var it in s.Items)
            {
                var def = data.Item(it.Id);
                if (def == null) { lost.Add(it.Id); continue; }
                var inst = FromSaved(it);
                if (def.IsEquip && inst.Stats == null) inst = ItemInstance.NewEquip(def);
                if (it.Tab == (int)def.Tab && it.Slot >= 0 && it.Slot < g.Inventory.SlotCount(def.Tab) && g.Inventory.Get(def.Tab, it.Slot) == null)
                    g.Inventory.SetRaw(def.Tab, it.Slot, inst);
                else if (def.IsEquip) g.Inventory.AddInstance(inst);
                else g.Inventory.Add(it.Id, it.Count);
            }
            foreach (var kv in s.Equipment)
            {
                var def = data.Item(kv.Value.Id);
                var slot = ItemEnums.SlotFromKey(kv.Key);
                if (def == null || slot == EquipSlot.None) { lost.Add(kv.Value.Id); continue; }
                var inst = FromSaved(kv.Value);
                if (inst.Stats == null) inst = ItemInstance.NewEquip(def);
                g.Equipment.SetRaw(slot, inst);
            }
            foreach (var kv in s.Skills) if (data.Skill(kv.Key) != null) g.Skills.Levels[kv.Key] = kv.Value;
            foreach (var kv in s.Cooldowns) g.Skills.Cooldowns[kv.Key] = kv.Value;
            foreach (var kv in s.SkillMasters) if (data.Skill(kv.Key) != null) g.Skills.Masters[kv.Key] = kv.Value;
            foreach (var q in s.QuickSlots) if (q.Key >= 0 && q.Key < QuickSlotCount) g.QuickSlots[q.Key] = new QuickSlot { Kind = q.Kind, Id = q.Id };
            foreach (var q in s.Quests)
            {
                if (data.Quest(q.Id) == null) continue;
                var p = new QuestProgress { Id = q.Id, Status = q.Status == "done" ? QuestStatus.Completed : QuestStatus.InProgress, CompletedAtPlaySec = q.At };
                foreach (var kv in q.Counts) p.Counts[kv.Key] = kv.Value;
                g.Quests.Entries[q.Id] = p;
            }
            foreach (var kv in s.Flags) g.Flags[kv.Key] = kv.Value;
            g.RefreshStats();
            var md = data.GetMap(s.Map) ?? data.GetMap(StartMap);
            g.Map = g.GetOrCreateMap(md);
            g.Body = new PlayerBody(s.X, s.Y);
            bool inside = s.X > 0 && s.X < md.Width && s.Map == md.Id;
            var pos = inside ? (s.X, s.Y) : md.SpawnPoint();
            PlayerPhysics.PlaceOnGround(g.Body, g.Map.Physics, pos.Item1, pos.Item2);
            if (g.Body.State == BodyState.Air && g.Body.Seg == null)
            {
                // 空中で保存していた: 一番近い下の足場へ（無ければ出現の位置）
                var sp = md.SpawnPoint();
                if (g.Map.Physics.SegBelow(pos.Item1, pos.Item2) == null) PlayerPhysics.PlaceOnGround(g.Body, g.Map.Physics, sp.x, sp.y);
            }
            g.ReadTownSave(s);
            g.ReadCollection(s.Collection, r0 ^ r1);
            g.Flags["visit." + md.Id] = true;
            g.RefreshStats();
            if (c.Hp <= 0) c.Hp = Math.Max(1, g.Stats.MaxHp / 2);
            g.Out.Clear();
            if (lost.Count > 0) g.Out.Add(GameEventType.Message, text: "データに無いアイテムを外した: " + string.Join(", ", lost));
            return g;
        }
    }
}
