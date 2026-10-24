"use client"

import { useTranslations } from "next-intl"
import { Mail, Tag, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ShareDialog } from "./share-dialog"
import { parseTags } from "@/lib/email-tags"

export interface Email {
  id: string
  address: string
  createdAt: number
  expiresAt: number
  label?: string | null
}

interface EmailRowProps {
  email: Email
  selected: boolean
  onSelect: (email: Email) => void
  onEditLabel: (email: Email) => void
  onDelete: (email: Email) => void
}

export function EmailRow({ email, selected, onSelect, onEditLabel, onDelete }: EmailRowProps) {
  const t = useTranslations("emails.list")
  const tags = parseTags(email.label)

  return (
    <div
      className={cn("flex items-center gap-2 p-2 rounded cursor-pointer text-sm group",
        "hover:bg-primary/5",
        selected && "bg-primary/10"
      )}
      onClick={() => onSelect(email)}
    >
      <Mail className="h-4 w-4 text-primary/60 shrink-0" />
      <div className="truncate flex-1 min-w-0">
        <div className="font-medium truncate">{email.address}</div>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            <Tag className="h-3 w-3 shrink-0 text-primary/70" />
            {tags.map(tag => (
              <span key={tag} className="text-[11px] leading-4 px-1.5 rounded bg-primary/10 text-primary/80 truncate max-w-[140px]">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="text-xs text-gray-500">
          {new Date(email.expiresAt).getFullYear() === 9999 ? (
            t("permanent")
          ) : (
            `${t("expiresAt")}: ${new Date(email.expiresAt).toLocaleString()}`
          )}
        </div>
      </div>
      <div className="opacity-0 group-hover:opacity-100 flex gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={t("editLabel")}
          onClick={() => onEditLabel(email)}
        >
          <Tag className="h-4 w-4" />
        </Button>
        <ShareDialog emailId={email.id} emailAddress={email.address} />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDelete(email)}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}
