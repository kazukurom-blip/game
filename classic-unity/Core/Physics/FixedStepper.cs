// 固定 60 回/秒の更新。Unity の Update（毎フレームの時間はばらばら）から呼ぶ。
// たまった時間ぶんだけ 1/60 秒の更新を回し、余りは Alpha（0〜1）として描く時の補間に使える。
// 重いフレームで更新が雪だるま式に増えないよう、1 回の呼び出しで回す数に上限を付ける（MaxStepsPerCall）。
using System;

namespace Lumina.Core.Physics
{
    public sealed class FixedStepper
    {
        public readonly double Step;
        public int MaxStepsPerCall = 8;
        private double acc;
        public long TotalSteps { get; private set; }

        public FixedStepper(double step = Feel.Dt) { Step = step; }

        /// <summary>前の更新から今までの、次の 1 ステップへの割合（描く時の補間用）</summary>
        public double Alpha => acc / Step;

        /// <summary>realDt 秒ぶん進める。何回 onStep を呼んだかを返す。</summary>
        public int Advance(double realDt, Action<double> onStep)
        {
            if (realDt < 0) realDt = 0;
            if (realDt > 0.25) realDt = 0.25; // 止まっていた後（ウィンドウを動かした等）に一気に進めない
            acc += realDt;
            int n = 0;
            // 浮動小数の誤差で 1 ステップ取りこぼさないよう、ごく小さな余裕を見る
            while (acc + 1e-9 >= Step && n < MaxStepsPerCall)
            {
                acc -= Step;
                if (acc < 0) acc = 0;
                onStep(Step);
                n++;
                TotalSteps++;
            }
            if (n >= MaxStepsPerCall && acc > Step) acc = Step * 0.5; // 追いつけない分は捨てる
            return n;
        }

        public void Reset() { acc = 0; }
    }
}
