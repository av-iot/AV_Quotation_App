"use client";

import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  MessageCircle, Mail, Copy, Check, ExternalLink,
  Download, Paperclip, Printer, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  customerSalutation?: string;
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  docType: "proposal" | "quotation" | "receipt";
  docNo: string;
  docUrl: string;
  preferredFormats?: string[];
}

export default function ShareModal({
  isOpen,
  onClose,
  customerName,
  customerSalutation,
  customerPhone,
  customerEmail,
  customerAddress,
  docType,
  docNo,
  docUrl,
  preferredFormats = [],
}: ShareModalProps) {
  const { toast } = useToast();
  const [letters, setLetters] = useState<any[]>([]);
  const [includeAttachments, setIncludeAttachments] = useState(docType === "proposal");
  const [showEmailEdit, setShowEmailEdit] = useState(false);
  const [showWaEdit, setShowWaEdit] = useState(false);
  const [copiedWa, setCopiedWa] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [waMessage, setWaMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");

  useEffect(() => {
    setIncludeAttachments(docType === "proposal");
    setShowEmailEdit(false);
    setShowWaEdit(false);
  }, [docType, isOpen]);

  useEffect(() => {
    async function fetchLetters() {
      try {
        const snap = await getDoc(doc(db, "settings", "engineers"));
        if (snap.exists()) {
          const shareable = (snap.data().letters || []).filter((x: any) => x.sendViaEmailWhatsapp);
          setLetters(shareable);
        }
      } catch {}
    }
    fetchLetters();
  }, [isOpen]);

  useEffect(() => {
    const docLabel = docType === "proposal" ? "Proposal" : docType === "receipt" ? "Receipt" : "Quotation";
    const extra = includeAttachments && letters.length > 0
      ? `\n\nAlso attaching:\n${letters.map(l => `- ${l.name}`).join("\n")}`
      : "";
    const sal = customerSalutation?.trim();
    const greeting = sal
      ? `Dear ${sal} ${customerName || ""}`.trim()
      : customerName
        ? `Dear ${customerName}`
        : "Dear Sir / Madam";

    if (docType === "receipt") {
      setWaMessage(`${greeting},\n\nThank you for your payment. Please find attached the official Payment Receipt (Ref: ${docNo}).\n\nBest regards,\nAlta Vision Solar`);
      setEmailBody(`${greeting},\n\nThank you for your payment. Please find attached the official Payment Receipt (Ref: ${docNo}) for your solar installation project.\n\nShould you have any questions, please feel free to contact us.\n\nBest regards,\nAlta Vision Solar`);
      setEmailSubject(`Alta Vision — Payment Receipt — ${docNo}`);
    } else {
      setWaMessage(`${greeting},\n\nThank you for choosing Alta Vision. Please find attached your Solar ${docLabel} (Ref: ${docNo}) for your premises.${extra}\n\nWe look forward to partnering with you. Feel free to reach out with any questions.\n\nBest regards,\nAlta Vision Solar`);
      setEmailBody(`${greeting},\n\nThank you for choosing Alta Vision. Please find attached your Solar ${docLabel} (Ref: ${docNo}) detailing the system configuration, specifications, and investment breakdown for your premises.${extra}\n\nWe look forward to your confirmation. Please do not hesitate to contact us for any clarifications.\n\nBest regards,\nAlta Vision Solar`);
      setEmailSubject(`Alta Vision — Solar ${docLabel} — ${docNo}`);
    }
  }, [customerName, customerSalutation, docNo, docType, letters, includeAttachments]);

  const fmtPhone = (phone: string) => {
    if (!phone) return "";
    let d = phone.replace(/\D/g, "");
    if (d.startsWith("0")) d = "94" + d.substring(1);
    return d;
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/${fmtPhone(customerPhone)}?text=${encodeURIComponent(waMessage)}`, "_blank", "noopener,noreferrer");
  };

  const handleGmail = () => {
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${customerEmail || ""}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`, "_blank", "noopener,noreferrer");
  };

  const handleOutlook = () => {
    window.open(`mailto:${customerEmail || ""}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`, "_blank");
  };

  const handleDownloadPdf = () => {
    window.open(docUrl, "_blank");
  };

  const copy = async (text: string, which: "wa" | "email") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "wa") { setCopiedWa(true); setTimeout(() => setCopiedWa(false), 2000); }
      else { setCopiedEmail(true); setTimeout(() => setCopiedEmail(false), 2000); }
      toast({ title: "Copied to clipboard" });
    } catch {}
  };

  const hasWaPref = preferredFormats.includes("whatsapp");
  const hasEmailPref = preferredFormats.includes("email");
  const docLabel = docType === "proposal" ? "Proposal" : docType === "receipt" ? "Receipt" : "Quotation";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[440px] p-0 rounded-2xl border border-border overflow-hidden max-h-[92vh] flex flex-col gap-0 [&>button]:hidden">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-border/60 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-black tracking-tight">Send {docLabel}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="font-mono font-bold text-foreground">{docNo}</span>
              <span className="text-muted-foreground/50">→</span>
              <span className="truncate">{customerName}</span>
              {(hasWaPref || hasEmailPref) && (
                <span className="flex gap-1 shrink-0">
                  {hasWaPref && <span className="text-[8px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full uppercase tracking-wide">WA ✓</span>}
                  {hasEmailPref && <span className="text-[8px] font-black bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full uppercase tracking-wide">Email ✓</span>}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-3"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* ── Hero action buttons ── */}
          <div className="grid grid-cols-3 gap-2.5">
            <ActionCard
              icon={<MessageCircle className="h-5 w-5" />}
              label="WhatsApp"
              sub={customerPhone || "No number"}
              color="emerald"
              preferred={hasWaPref}
              onClick={handleWhatsApp}
              disabled={!customerPhone}
            />
            <ActionCard
              icon={<Mail className="h-5 w-5" />}
              label="Gmail"
              sub={customerEmail ? customerEmail.split("@")[0] + "@…" : "No email"}
              color="red"
              preferred={hasEmailPref}
              onClick={handleGmail}
              disabled={!customerEmail}
            />
            <ActionCard
              icon={<Download className="h-5 w-5" />}
              label="PDF"
              sub="Download"
              color="primary"
              preferred={false}
              onClick={handleDownloadPdf}
            />
          </div>

          {/* ── PDF attachment tip ── */}
          <div className="flex items-start gap-2.5 bg-muted/40 border border-border/50 rounded-xl p-3 text-[11px] text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p className="leading-relaxed font-medium">
              To attach the PDF: tap <strong className="text-foreground">PDF</strong> above to download, then open WhatsApp or Gmail and attach the file from your downloads folder.
            </p>
          </div>

          {/* ── WhatsApp message editor ── */}
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowWaEdit(!showWaEdit)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[11px] font-black uppercase tracking-wide text-foreground">WhatsApp Message</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); copy(waMessage, "wa"); }}
                  className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                >
                  {copiedWa ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  Copy
                </button>
                {showWaEdit ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>
            {showWaEdit && (
              <div className="border-t border-border/50 p-3">
                <Textarea
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  className="min-h-[110px] text-xs resize-none rounded-lg border-border/50 bg-background"
                />
              </div>
            )}
            {!showWaEdit && (
              <div className="border-t border-border/50 px-3.5 py-2 bg-muted/20">
                <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{waMessage.split("\n")[0]}</p>
              </div>
            )}
          </div>

          {/* ── Email editor ── */}
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowEmailEdit(!showEmailEdit)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-[11px] font-black uppercase tracking-wide text-foreground">Email Message</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); copy(emailBody, "email"); }}
                  className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                >
                  {copiedEmail ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  Copy
                </button>
                {showEmailEdit ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </button>
            {showEmailEdit ? (
              <div className="border-t border-border/50 p-3 space-y-2">
                <Input
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Subject"
                  className="h-8 text-xs rounded-lg border-border/50"
                />
                <Textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  className="min-h-[110px] text-xs resize-none rounded-lg border-border/50 bg-background"
                />
              </div>
            ) : (
              <div className="border-t border-border/50 px-3.5 py-2 bg-muted/20">
                <p className="text-[10px] text-muted-foreground font-mono truncate">{emailSubject}</p>
              </div>
            )}
          </div>

          {/* ── Corporate attachments ── */}
          {docType !== "receipt" && (
            <label className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/20 cursor-pointer select-none hover:bg-muted/40 transition-colors">
              <div>
                <span className="text-[11px] font-black text-foreground block">Include Corporate Attachments</span>
                <span className="text-[10px] text-muted-foreground">LEC letters, company profile documents</span>
              </div>
              <input
                type="checkbox"
                checked={includeAttachments}
                onChange={(e) => setIncludeAttachments(e.target.checked)}
                className="h-4 w-4 rounded border-border text-emerald-600 cursor-pointer"
              />
            </label>
          )}

          {/* ── Letter downloads ── */}
          {includeAttachments && letters.length > 0 && (
            <div className="space-y-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">Additional Documents</span>
              {letters.map((l) => (
                <div key={l.id} className="flex items-center justify-between bg-muted/30 rounded-xl border border-border/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold text-foreground block truncate">{l.name}</span>
                    <span className="text-[9px] font-mono text-muted-foreground">{l.fileName}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/docs/attachments?file=${encodeURIComponent(l.fileName)}`, "_blank")}
                    className="h-7 text-[10px] font-bold shrink-0 ml-3"
                  >
                    <Download className="h-3 w-3 mr-1" /> Save
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* ── Outlook / print fallbacks ── */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleOutlook}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors font-medium"
            >
              <ExternalLink className="h-3 w-3" /> Outlook / System Mail
            </button>
            <span className="text-muted-foreground/30">·</span>
            <button
              onClick={handleDownloadPdf}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors font-medium"
            >
              <Printer className="h-3 w-3" /> Print / Save PDF
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ActionCardProps {
  icon: React.ReactNode;
  label: string;
  sub: string;
  color: "emerald" | "red" | "primary";
  preferred: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function ActionCard({ icon, label, sub, color, preferred, onClick, disabled }: ActionCardProps) {
  const base = "relative flex flex-col items-center gap-1.5 p-3.5 rounded-xl transition-all active:scale-95 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const colors = {
    emerald: "bg-emerald-500 hover:bg-emerald-600 text-white",
    red: "bg-red-500 hover:bg-red-600 text-white",
    primary: "bg-primary hover:bg-primary/90 text-primary-foreground",
  };
  const subColors = {
    emerald: "text-emerald-100",
    red: "text-red-100",
    primary: "text-primary-foreground/70",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(base, colors[color], disabled && "opacity-40 cursor-not-allowed active:scale-100")}
    >
      {preferred && (
        <span className="absolute -top-1.5 -right-1.5 text-[7px] font-black bg-white text-emerald-700 px-1 py-0.5 rounded-full uppercase shadow-sm border border-emerald-200 leading-none">✓</span>
      )}
      {icon}
      <span className="text-[10px] font-black uppercase tracking-wide leading-none">{label}</span>
      <span className={cn("text-[9px] font-mono leading-none truncate max-w-full px-1", subColors[color])}>{sub}</span>
    </button>
  );
}
