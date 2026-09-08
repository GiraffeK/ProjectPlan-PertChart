import React from 'react';
import {
  X,
  HelpCircle,
  Move,
  MousePointerClick,
  PlusSquare,
  Network,
  Layers,
  Calendar,
  Keyboard,
  CheckCircle2,
} from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 text-white shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-xs">
              <HelpCircle size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <span>操作體驗與使用說明</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  HELP
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Microsoft Project 操作體驗、PERT 網圖連線、階層傳承與快捷鍵
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-700">
          {/* Section 1: Microsoft Project 操作體驗 (綠框核心內容) */}
          <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4.5 space-y-3">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
              <h4 className="font-bold text-blue-950 text-sm flex items-center space-x-1.5">
                <Network size={16} className="text-blue-600" />
                <span>Microsoft Project 操作體驗（PERT 網圖核心操作）</span>
              </h4>
            </div>

            <div className="grid grid-cols-1 gap-2.5 pt-1">
              <div className="flex items-start space-x-3 bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0 mt-0.5">
                  <MousePointerClick size={16} />
                </div>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-900 flex items-center space-x-1">
                    <span>👉 框中央 (手指圖示)</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    <b>拖曳連線</b>：拖曳可拉出箭頭連線至別的任務，自動建立完成-開始 (Finish-to-Start) 依賴關聯；<b>點擊</b>框中央可開啟編輯視窗。
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Move size={16} />
                </div>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-900 flex items-center space-x-1">
                    <span>👉 四周邊框 (移動圖示)</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    滑鼠游標移至任務框四周外圍會顯示四向箭頭，<b>拖曳可移動</b>任務框在畫布上的自訂位置；若選取多個任務可一起群組移動。
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 bg-white p-3 rounded-xl border border-blue-100 shadow-2xs">
                <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 mt-0.5">
                  <PlusSquare size={16} />
                </div>
                <div className="text-xs space-y-1">
                  <div className="font-bold text-slate-900 flex items-center space-x-1">
                    <span>👉 按住 Shift 拖曳畫布</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    在空白畫布上<b>按住 Shift 鍵並拖曳滑鼠</b>（或點擊左下角「繪製新任務」按鈕），可直接拉出矩形建立新任務框。
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: WBS 階層與前置依賴傳承 */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
              <Layers size={15} className="text-slate-600" />
              <span>WBS 階層傳承與依賴關聯</span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>第一子任務自動繼承父階前置</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  當父階任務（摘要任務）設定前置任務時，其底下的第一項子任務會自動繼承該前置依賴，維持甘特圖與關鍵路徑計算連貫。
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>子任務拉出新任務維持同階</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  從任一子任務拉出箭頭建立新任務時，新任務將自動繼承相同的大綱階層 (Outline Level) 與父階 ID，維持同階子項目。
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                  <CheckCircle2 size={13} className="text-blue-600" />
                  <span>刪除依賴連線</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  在 PERT 網圖上的連線箭頭上<b>雙擊 (Double Click)</b>，或在甘特圖前置任務標籤上雙擊，即可直接刪除該依賴關係。
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
                <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                  <CheckCircle2 size={13} className="text-blue-600" />
                  <span>右鍵選單功能</span>
                </div>
                <p className="text-slate-500 leading-relaxed">
                  在任務列按右鍵可快速「縮排 (Indent) 為子任務」、「凸排 (Outdent)」、「複製 / 剪下 / 貼上」與「插入新任務」。
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: 甘特圖排程調整 */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
              <Calendar size={15} className="text-slate-600" />
              <span>甘特圖 (Gantt) 拖曳調整</span>
            </h4>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1.5">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-slate-800">拖曳調整工期 / 起始時間：</span>
              </div>
              <p className="leading-relaxed">
                在甘特圖中，拖曳任務長條主體可手動平移開始日期；拖曳任務長條的右端邊緣可縮放調整該任務之工期 (Duration)。
              </p>
            </div>
          </div>

          {/* Section 4: 常用鍵盤快捷鍵 */}
          <div className="space-y-3">
            <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center space-x-1.5">
              <Keyboard size={15} className="text-slate-600" />
              <span>常用鍵盤快捷鍵</span>
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-center space-y-1">
                <div className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 inline-block shadow-2xs">
                  Ctrl + S
                </div>
                <div className="text-[11px] text-slate-500">儲存專案至原檔</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-center space-y-1">
                <div className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 inline-block shadow-2xs">
                  Ctrl + Z
                </div>
                <div className="text-[11px] text-slate-500">復原上一步 (Undo)</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-center space-y-1">
                <div className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 inline-block shadow-2xs">
                  Ctrl + Y
                </div>
                <div className="text-[11px] text-slate-500">重做操作 (Redo)</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-200 text-center space-y-1">
                <div className="font-mono font-bold text-slate-800 bg-white px-1.5 py-0.5 rounded border border-slate-200 inline-block shadow-2xs">
                  Shift + 拖曳
                </div>
                <div className="text-[11px] text-slate-500">畫布拉出新任務</div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            隨時可點擊頂部工具列的 <b className="text-amber-600 font-mono">HELP</b> 按鈕再次開啟本指南
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            我知道了 (關閉)
          </button>
        </div>
      </div>
    </div>
  );
};
