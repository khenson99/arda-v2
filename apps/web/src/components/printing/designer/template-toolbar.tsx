import * as React from 'react';
import { Copy, Redo2, Save, Settings2, Star, Undo2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';

interface TemplateToolbarProps {
  templateName: string;
  onTemplateNameChange: (value: string) => void;
  onNewTemplate: () => void;
  onSaveTemplate: () => void;
  onCloneTemplate: () => void;
  onSetDefault: () => void;
  onResetSeed: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isSaving?: boolean;
  hasSelectedTemplate?: boolean;
}

export function TemplateToolbar({
  templateName,
  onTemplateNameChange,
  onNewTemplate,
  onSaveTemplate,
  onCloneTemplate,
  onSetDefault,
  onResetSeed,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  isSaving = false,
  hasSelectedTemplate = false,
}: TemplateToolbarProps) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto_auto_auto]">
        <Input
          value={templateName}
          onChange={(e) => onTemplateNameChange(e.target.value)}
          placeholder="Template name"
        />

        <Button type="button" size="sm" variant="outline" onClick={onNewTemplate}>New</Button>

        <Button type="button" size="sm" variant="outline" onClick={onSaveTemplate} disabled={isSaving}>
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>

        <Button type="button" size="sm" variant="outline" onClick={onCloneTemplate} disabled={!hasSelectedTemplate}>
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </Button>

        <Button type="button" size="sm" variant="outline" onClick={onSetDefault} disabled={!hasSelectedTemplate}>
          <Star className="h-3.5 w-3.5" />
          Set default
        </Button>

        <Button type="button" size="sm" variant="outline" onClick={onResetSeed}>
          <Settings2 className="h-3.5 w-3.5" />
          Reset seed
        </Button>

        <div className="flex items-center gap-2 lg:justify-end">
          <Button type="button" size="sm" variant="outline" onClick={onUndo} disabled={!canUndo}>
            <Undo2 className="h-3.5 w-3.5" />
            Undo
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onRedo} disabled={!canRedo}>
            <Redo2 className="h-3.5 w-3.5" />
            Redo
          </Button>
        </div>
      </div>
    </div>
  );
}
