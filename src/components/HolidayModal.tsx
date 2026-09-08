import React, { useState } from 'react';
import type { Holiday } from '../core/types';
import { X, Plus, Trash2, Calendar, ShieldCheck } from 'lucide-react';

interface HolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  holidays: Holiday[];
  onAddHoliday: (holiday: { date: string; name: string }) => void;
  onRemoveHoliday: (holidayId: string) => void;
}

export const HolidayModal: React.FC<HolidayModalProps> = ({
  isOpen,
  onClose,
  holidays,
  onAddHoliday,
  onRemoveHoliday,
}) => {
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) {
      setErrorMsg('請選擇假日日期');
      return;
    }

    // Check if already exists in custom holidays
    if (holidays.some(h => h.date === newDate)) {
      setErrorMsg('此日期已存在於自訂假日中');
      return;
    }

    onAddHoliday({
      date: newDate,
      name: newName.trim() || '自訂假日',
    });

    setNewDate('');
    setNewName('');
    setErrorMsg('');
  };

  // Sort custom holidays by date
  const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 select-none">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-600 flex items-center justify-center">
              <Calendar size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">特定假日管理 (Holiday Management)</h3>
              <p className="text-xs text-slate-500">
                以「工作天」排程時，遇到假日將自動順延且不扣除工期
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* 1. Default Fixed Holidays (Read-only System Defaults) */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                <ShieldCheck size={14} className="text-emerald-600" />
                <span>系統預設固定假日 (System Default)</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium">
                預設固定
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div className="bg-white p-2 rounded border border-slate-200/80 flex items-center justify-between">
                <span className="font-medium">每週固定假日</span>
                <span className="font-bold text-slate-800">星期六、日 (週休)</span>
              </div>
              <div className="bg-white p-2 rounded border border-slate-200/80 flex items-center justify-between">
                <span className="font-medium">每年固定公休</span>
                <span className="font-mono font-bold text-slate-800">12/25, 01/01</span>
              </div>
            </div>
          </div>

          {/* 2. Add New Custom Holiday Form */}
          <form onSubmit={handleAdd} className="bg-blue-50/50 border border-blue-100 rounded-lg p-3.5 space-y-3">
            <div className="text-xs font-bold text-blue-900 flex items-center space-x-1">
              <Plus size={14} className="text-blue-600" />
              <span>新增自訂假日 (Add Custom Holiday)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">假日日期 *</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={e => {
                    setNewDate(e.target.value);
                    setErrorMsg('');
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">備註名稱 (選填)</label>
                <input
                  type="text"
                  placeholder="例如: 國慶日、中秋節"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-1 flex items-end">
                <button
                  type="submit"
                  className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center justify-center space-x-1 h-[32px]"
                >
                  <Plus size={13} />
                  <span>新增</span>
                </button>
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs text-red-600 font-medium">{errorMsg}</p>
            )}
          </form>

          {/* 3. Custom Holidays List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">
                自訂假日清單 ({sortedHolidays.length})
              </span>
              <span className="text-[11px] text-slate-400">
                可自訂刪除非固定之特定假日
              </span>
            </div>

            {sortedHolidays.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
                目前尚無自訂假日。可於上方表單自行新增國定假日或公司公休日。
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-48 overflow-y-auto">
                {sortedHolidays.map(h => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                        {h.date}
                      </span>
                      <span className="text-slate-700 font-medium">
                        {h.name || '自訂假日'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveHoliday(h.id)}
                      title="刪除此假日"
                      className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-200 bg-slate-50/80">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
