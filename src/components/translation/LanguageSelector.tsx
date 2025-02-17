import React from 'react';
import { Globe } from 'lucide-react';
import { LANGUAGES } from '../../constants/languages';

interface LanguageSelectorProps {
  value: string;
  onChange: (code: string) => void;
  label: string;
}

export function LanguageSelector({ value, onChange, label }: LanguageSelectorProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Globe className="h-5 w-5 text-gray-400" />
        </div>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-10 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="">Selecione o idioma</option>
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}