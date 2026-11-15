"use client";

import Script from "next/script";
import { useEffect, useState, type FormEvent } from "react";

type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

type LiffClient = {
  init: (options: { liffId: string }) => Promise<void>;
  getContext: () => { type: string } | null;
  sendMessages: (messages: LineFlexMessage[]) => Promise<void>;
};

declare global {
  interface Window {
    liff?: LiffClient;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFlexMessage(value: unknown): LineFlexMessage | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.message)) return null;
  const message = value.message;
  if (message.type !== "flex" || typeof message.altText !== "string" || !isRecord(message.contents)) return null;
  return {
    type: "flex",
    altText: message.altText,
    contents: message.contents,
  };
}

function readApiError(value: unknown): string | null {
  if (!isRecord(value) || typeof value.error !== "string") return null;
  return value.error;
}

function readLiffError(value: unknown): string {
  if (!isRecord(value)) return value instanceof Error ? value.message : "ส่งข้อความเข้า LINE ไม่สำเร็จ";

  const code = typeof value.code === "string" || typeof value.code === "number" ? String(value.code) : null;
  const message = typeof value.message === "string" ? value.message : "ส่งข้อความเข้า LINE ไม่สำเร็จ";
  if (code === "403") return "LINE ปฏิเสธการส่งข้อความ (403): ตรวจสอบว่า LIFF เปิด scope chat_message.write และเปิดหน้านี้จาก LIFF URL ภายในกลุ่มโดยตรง";
  return code ? `LINE ส่งข้อความไม่สำเร็จ (${code}): ${message}` : message;
}

export function SendToGroupFlow() {
  const [text, setText] = useState("");
  const [isLiffReady, setIsLiffReady] = useState(false);
  const [chatType, setChatType] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSent, setIsSent] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [progress, setProgress] = useState("กำลังโหลด LINE LIFF…");
  const [buttonFeedback, setButtonFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!scriptLoaded) return;

    const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
    if (!liffId) {
      setProgress("ยังเริ่ม LIFF ไม่ได้");
      setError("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_LINE_LIFF_ID ใน Vercel");
      return;
    }

    const liff = window.liff;
    if (!liff) {
      setProgress("ยังเริ่ม LIFF ไม่ได้");
      setError("โหลด LINE LIFF ไม่สำเร็จ ลองเปิดหน้านี้ใหม่");
      return;
    }

    let isCurrent = true;
    setProgress("กำลังเชื่อมต่อ LINE LIFF…");
    liff.init({ liffId }).then(() => {
      if (!isCurrent) return;
      const contextType = liff.getContext()?.type ?? null;
      setChatType(contextType);
      setIsLiffReady(true);
      setProgress(contextType === "group" || contextType === "room"
        ? "พร้อมส่งเข้ากลุ่มนี้"
        : "เชื่อมต่อ LIFF แล้ว แต่ไม่พบว่าเปิดมาจากกลุ่ม LINE");
    }).catch(() => {
      if (!isCurrent) return;
      setProgress("เชื่อมต่อ LINE LIFF ไม่สำเร็จ");
      setError("เชื่อมต่อ LINE LIFF ไม่สำเร็จ ตรวจสอบ LIFF ID และ URL ของแอป");
    });

    return () => {
      isCurrent = false;
    };
  }, [scriptLoaded]);

  const isGroupChat = chatType === "group" || chatType === "room";

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) return;
    if (!text.trim()) {
      setButtonFeedback("วางข้อความประกาศก่อน แล้วกดปุ่มส่งครับ");
      return;
    }

    setButtonFeedback("รับคำสั่งแล้ว กำลังตรวจ LIFF พร้อมส่งหรือไม่…");
    const liff = window.liff;
    if (!isLiffReady || !isGroupChat || !liff) {
      setProgress("หยุดก่อนเรียก API: หน้านี้ไม่ได้เปิดจากกลุ่ม LINE ที่รองรับ");
      setButtonFeedback(`หยุดก่อนเรียก API: LIFF=${isLiffReady ? "พร้อม" : "ยังไม่พร้อม"}, chat=${chatType ?? "ไม่ทราบ"}`);
      setError("กรุณาเปิด LIFF URL จากภายในกลุ่ม LINE โดยตรง แล้วลองอีกครั้ง");
      return;
    }
    setIsSending(true);
    setError(null);
    setIsSent(false);
    setProgress("กำลังส่งข้อความไปสร้างผลจับคู่…");
    setButtonFeedback("กำลังเรียก Rackoo API เพื่อจับคู่…");

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/send-to-group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text.trim() }),
        signal: controller.signal,
      });
      const responseText = await response.text();
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(responseText) as unknown;
      } catch {
        responseBody = null;
      }
      if (!response.ok) {
        throw new Error(readApiError(responseBody) ?? `API ตอบกลับ ${response.status}: ${responseText.slice(0, 300) || "ไม่มีรายละเอียด"}`);
      }

      const message = readFlexMessage(responseBody);
      if (!message) throw new Error("API ส่งผลจับคู่กลับมาในรูปแบบที่ไม่ถูกต้อง");

      setProgress("สร้างผลจับคู่แล้ว กำลังส่ง Flex เข้าแชต LINE…");
      setButtonFeedback("ได้ผลจับคู่แล้ว กำลังส่งเข้า LINE…");
      await liff.sendMessages([message]);
      setIsSent(true);
      setProgress("ส่ง Flex เข้าแชต LINE แล้ว");
      setButtonFeedback("ส่งเข้า LINE สำเร็จ");
    } catch (sendError) {
      const message = readLiffError(sendError);
      console.error("[send-to-group] Send flow failed", message);
      setProgress("ส่งไม่สำเร็จ");
      setButtonFeedback("ส่งไม่สำเร็จ ดูรายละเอียดด้านล่าง");
      setError(sendError instanceof DOMException && sendError.name === "AbortError"
        ? "เรียก Rackoo API เกิน 20 วินาที ตรวจสอบ Vercel Functions Logs แล้วลองใหม่"
        : message);
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  }

  return (
    <>
      <Script
        src="https://static.line-scdn.net/liff/edge/2/sdk.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
        onError={() => {
          setProgress("โหลด LINE LIFF SDK ไม่สำเร็จ");
          setError("โหลด LINE LIFF ไม่สำเร็จ ลองเปิดหน้านี้ใหม่");
        }}
      />
      <main aria-label="ส่งผลจับคู่เข้ากลุ่ม" className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-5">
        <header className="mb-5 space-y-1">
          <h1 className="text-xl font-bold text-slate-900">จับคู่และส่งเข้ากลุ่ม</h1>
          <p className="text-sm text-slate-500">วางข้อความประกาศ แล้วส่งผลกลับเข้าแชตที่เปิดหน้านี้</p>
        </header>

        <form onSubmit={handleSend} className="space-y-4">
          <label htmlFor="pairing-announcement" className="block text-sm font-semibold text-slate-700">
            ข้อความประกาศ
          </label>
          <textarea
            id="pairing-announcement"
            maxLength={20000}
            rows={12}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
              setIsSent(false);
              setButtonFeedback(null);
              if (isLiffReady) setProgress(isGroupChat ? "พร้อมส่งเข้ากลุ่มนี้" : "เปิดหน้านี้จาก LIFF link ในกลุ่ม LINE เพื่อส่งกลับเข้ากลุ่ม");
            }}
            placeholder="วางประกาศสนามและรายชื่อสมาชิกที่นี่"
            className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
          />

          <p role="status" aria-live="polite" className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
            {progress}
          </p>
          {buttonFeedback ? <p role={error ? "alert" : "status"} aria-live="polite" className={`rounded-xl px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-800"}`}>{buttonFeedback}</p> : null}
          {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {isSent ? <p role="status" className="text-sm font-medium text-emerald-700">ส่งผลจับคู่เข้ากลุ่มแล้ว</p> : null}

          <button
            type="submit"
            disabled={isSending}
            aria-disabled={isSending}
            className="flex min-h-14 w-full touch-manipulation items-center justify-center rounded-xl bg-primary px-4 text-base font-semibold text-white shadow-md transition-colors hover:bg-primary/90 active:scale-[0.99] active:bg-primary/80 disabled:cursor-wait disabled:opacity-65"
          >
            {isSending ? "กำลังจับคู่และส่ง…" : "จับคู่และส่งเข้ากลุ่ม"}
          </button>
        </form>
      </main>
    </>
  );
}
