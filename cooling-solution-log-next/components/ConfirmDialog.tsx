'use client';

import React from 'react';

interface ConfirmDialogProps {
  show: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  show,
  title,
  message,
  confirmText = 'Sí, borrar',
  cancelText = 'Cancelar',
  confirmColor = 'bg-red-600',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl p-5 max-w-sm w-full shadow-2xl border border-gray-700">
        <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-gray-300 mb-5">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-600 text-white py-2.5 rounded-lg text-sm font-medium active:bg-gray-500"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 ${confirmColor} text-white py-2.5 rounded-lg text-sm font-medium active:opacity-80`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}