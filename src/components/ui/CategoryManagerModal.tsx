import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  onAdd: (category: string) => void;
  onDelete: (category: string) => void;
}

export function CategoryManagerModal({ 
  isOpen, 
  onClose, 
  categories, 
  onAdd, 
  onDelete 
}: CategoryManagerModalProps) {
  const { t } = useTranslation();
  const [newCategory, setNewCategory] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      onAdd(trimmed);
      setNewCategory('');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('expenses.manage_categories') || 'Manage Categories'}>
      <div className="space-y-6 touch-pan-y overflow-x-hidden">
        <form onSubmit={handleAdd} className="flex gap-2">
          <Input 
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder={t('expenses.add_category_placeholder')}
            className="flex-1"
          />
          <Button type="submit" disabled={!newCategory.trim() || categories.includes(newCategory.trim())}>
            <Plus className="h-4 w-4 mr-2" />
            {t('common.add')}
          </Button>
        </form>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
          {categories.length > 0 ? (
            categories.map((category) => (
              <div 
                key={category} 
                className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group"
              >
                <span className="font-medium text-slate-700">{category}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                  onClick={() => onDelete(category)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-dashed">
              {t('expenses.no_categories_available')}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            {t('common.close') || 'Close'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
