import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../utils/utils';
import { Button } from './Button';
import { Input } from './Input';

interface CategoryManagerProps {
  categories: string[];
  selectedCategory: string;
  onSelect: (category: string) => void;
  onAdd: (category: string) => void;
  onDelete: (category: string) => void;
  className?: string;
}

export function CategoryManager({ 
  categories, 
  selectedCategory, 
  onSelect, 
  onAdd, 
  onDelete,
  className 
}: CategoryManagerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      onAdd(trimmed);
      setNewCategory('');
    }
  };

  const handleDelete = (e: React.MouseEvent, category: string) => {
    e.stopPropagation();
    onDelete(category);
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      {/* Trigger Button */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-between px-3 py-2 text-sm border rounded-md bg-background cursor-pointer hover:bg-slate-50 transition-colors",
          isOpen ? "ring-2 ring-ring ring-offset-2" : "border-input"
        )}
      >
        <span className={cn(selectedCategory ? "text-foreground" : "text-muted-foreground")}>
          {selectedCategory || t('expenses.category')}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isOpen && "rotate-180")} />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-white border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* List View */}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {categories.length > 0 ? (
              categories.map((category) => (
                <div
                  key={category}
                  onClick={() => {
                    onSelect(category);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer group transition-colors",
                    selectedCategory === category ? "bg-primary/5 text-primary font-medium" : "hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-center gap-2 truncate">
                    {selectedCategory === category && <Check className="h-3.5 w-3.5" />}
                    {category}
                  </div>
                  <button
                    onClick={(e) => handleDelete(e, category)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <div className="py-8 px-4 text-center">
                <p className="text-xs text-slate-400 italic">
                  {t('expenses.no_categories_available') || "No categories available. Create one below."}
                </p>
              </div>
            )}
          </div>

          {/* Input Strip */}
          <form 
            onSubmit={handleAdd}
            className="p-2 bg-slate-50 border-t flex gap-2"
          >
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t('expenses.add_category_placeholder') || "New category..."}
              className="h-8 text-xs bg-white"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="h-8 w-8 shrink-0"
              disabled={!newCategory.trim() || categories.includes(newCategory.trim())}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
