"use client";

import { useEffect, useRef } from "react";
import { copyText } from "./clipboard";
import styles from "../public.module.css";

type ArticleBodyProps = {
  renderedHtml: string;
  enableCodeCopy?: boolean;
};

export default function ArticleBody({ renderedHtml, enableCodeCopy = false }: ArticleBodyProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enableCodeCopy || !bodyRef.current) return;

    const body = bodyRef.current;
    let active = true;
    const cleanups: Array<() => void> = [];
    const blocks = Array.from(body.querySelectorAll<HTMLPreElement>("pre")).filter((block) => block.querySelector(":scope > code") || block.textContent);

    blocks.forEach((block, index) => {
      const parent = block.parentNode;
      if (!parent) return;

      const nextSibling = block.nextSibling;
      const originalClassName = block.className;
      const code = block.textContent ?? "";
      const wrapper = document.createElement("div");
      const toolbar = document.createElement("div");
      const button = document.createElement("button");
      const status = document.createElement("p");
      const number = index + 1;
      const statusId = `code-copy-status-${number}`;

      wrapper.className = styles.codeCopyBlock;
      wrapper.setAttribute("data-code-copy-block", "");
      toolbar.className = styles.codeCopyToolbar;
      button.type = "button";
      button.className = styles.codeCopyButton;
      button.textContent = `复制代码块 ${number}`;
      button.setAttribute("aria-describedby", statusId);
      status.id = statusId;
      status.className = styles.codeCopyStatus;
      status.setAttribute("role", "status");
      status.setAttribute("aria-label", `代码块 ${number} 复制状态`);
      status.setAttribute("aria-atomic", "true");
      block.classList.add(styles.codeCopyPre);

      async function handleCopy() {
        button.disabled = true;
        status.textContent = "复制中…";
        const copied = await copyText(code);
        if (!active) return;
        status.textContent = copied ? "代码已复制。" : "复制失败，请手动选择代码并复制。";
        button.disabled = false;
      }

      button.addEventListener("click", () => { void handleCopy(); });
      toolbar.append(button, status);
      parent.insertBefore(wrapper, block);
      wrapper.append(toolbar, block);

      cleanups.push(() => {
        if (block.parentNode === wrapper) {
          if (nextSibling?.parentNode === parent) parent.insertBefore(block, nextSibling);
          else parent.append(block);
        }
        block.className = originalClassName;
        wrapper.remove();
      });
    });

    return () => {
      active = false;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [enableCodeCopy, renderedHtml]);

  return (
    <div
      ref={bodyRef}
      className={styles.articleBody}
      data-testid="article-body"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
