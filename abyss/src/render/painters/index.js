// コードで描く絵の登録。アート担当は painters/ に種類ごとのファイルを作り、ここで登録する。
// 後に登録した物が同じ prefix なら上書き（より長い prefix が優先）。
import { installBasicPainters } from './basic.js';

export function installPainters() {
  installBasicPainters();
}
