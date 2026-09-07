import React from 'react';
import { X, AlertCircle, ExternalLink } from 'lucide-react';

interface MppGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MppGuideModal: React.FC<MppGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shadow-sm">
              MPP
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Microsoft Project (.mpp) 檔案匯入指引
              </h3>
              <p className="text-xs text-slate-500">
                如何將 .mpp 專案轉換為系統支援的 XML 格式
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 text-sm text-slate-700">
          {/* Why XML Notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start space-x-3 text-xs text-amber-900">
            <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">為什麼需要 XML 格式？</span>
              <p className="text-amber-800 leading-relaxed">
                <code>.mpp</code> 是微軟的封閉式二進位檔案格式，微軟官方為了讓第三方軟體能夠完整讀取與相容，特別設計了標準的 <b>XML Format (*.xml)</b> 進行無損資料交換。
              </p>
            </div>
          </div>

          {/* Step by step guide */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              簡單 3 步驟（在 Microsoft Project 中另存）：
            </h4>

            <div className="space-y-2.5">
              <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </span>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-800">在 Microsoft Project 中打開該 .mpp 專案</div>
                  <div className="text-slate-500">直接以 Microsoft Project 軟體開啟您的專案檔案。</div>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </span>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-800">
                    點擊左上角「檔案」➔「另存新檔」(Save As)
                  </div>
                  <div className="text-slate-500">
                    在「存檔類型」下拉選單中選擇：<span className="font-bold text-blue-600">「XML 格式 (*.xml)」</span>
                  </div>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-xl bg-slate-50 border border-slate-200/80">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </span>
                <div className="text-xs space-y-0.5">
                  <div className="font-semibold text-slate-800">存檔並匯入本系統</div>
                  <div className="text-slate-500">
                    點擊本系統右上角的「<b>匯入 MS Project</b>」按鈕，選取剛剛存出的 <code>.xml</code> 檔即可！
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* If no MS Project */}
          <div className="pt-1 border-t border-slate-100 text-xs text-slate-500 space-y-1.5">
            <div className="font-semibold text-slate-700">若您的電腦未安裝 Microsoft Project 軟體：</div>
            <p className="leading-relaxed">
              您可以使用免費開源的 <a href="https://www.projectlibre.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline font-medium inline-flex items-center space-x-0.5"><span>ProjectLibre</span><ExternalLink size={11} /></a> 開啟 <code>.mpp</code> 檔並轉存為 <code>.xml</code>，或是使用線上免費轉檔工具（搜尋「MPP to XML converter」）。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
};
