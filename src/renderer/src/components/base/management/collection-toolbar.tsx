import { Button, cn } from '@heroui/react'
import { KokoTextField } from '@renderer/components/base/koko-form'
import type React from 'react'
import { MdContentPaste } from 'react-icons/md'
import { tr } from '../../../../../shared/i18n'

interface CollectionImportToolbarProps {
  className?: string
  createAction: React.ReactNode
  inputAriaLabel: string
  inputTrailing?: React.ReactNode
  isImportDisabled?: boolean
  isImporting?: boolean
  onImport: () => void | Promise<void>
  onInputKeyUp?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste: () => void | Promise<void>
  onValueChange: (value: string) => void
  placeholder?: string
  value: string
}

const CollectionImportToolbar: React.FC<CollectionImportToolbarProps> = ({
  className,
  createAction,
  inputAriaLabel,
  inputTrailing,
  isImportDisabled,
  isImporting,
  onImport,
  onInputKeyUp,
  onPaste,
  onValueChange,
  placeholder,
  value
}) => (
  <div
    className={cn(
      'collection-import-toolbar sticky top-0 z-40 border-b border-separator bg-background/95 px-3 py-2 backdrop-blur-sm',
      className
    )}
  >
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <KokoTextField
        aria-label={inputAriaLabel}
        className="min-w-52 flex-1 basis-72"
        endContent={
          <Button
            aria-label={tr('Paste')}
            className="h-7 w-7 min-w-7"
            isIconOnly
            size="sm"
            variant="ghost"
            onPress={() => void onPaste()}
          >
            <MdContentPaste className="text-base" />
          </Button>
        }
        placeholder={placeholder}
        size="sm"
        value={value}
        onKeyUp={onInputKeyUp}
        onValueChange={onValueChange}
      />
      {inputTrailing ? <div className="flex h-8 shrink-0 items-center">{inputTrailing}</div> : null}
      <Button
        className="shrink-0"
        isDisabled={isImportDisabled}
        isPending={isImporting}
        size="sm"
        variant="primary"
        onPress={() => void onImport()}
      >
        {tr('Import')}
      </Button>
      <div className="flex h-8 shrink-0 items-center">{createAction}</div>
    </div>
  </div>
)

export default CollectionImportToolbar
