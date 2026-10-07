// 整树初始渲染冒烟（renderToString 不执行 effect，localStorage 缺失由 read() 的 try/catch 兜住）
import React from "react";
import { renderToString } from "react-dom/server";
import { StoreProvider } from "../src/core/store";
import App from "../src/App";

const html = renderToString(React.createElement(App));
const checks: [boolean, string][] = [
  [html.includes("时间轴编排"), "时间轴面板渲染"],
  [html.includes("燃放点位平面图"), "点位平面图渲染"],
  [html.includes("冲突提示"), "冲突面板渲染"],
  [html.includes("整场节目预览"), "整场预览渲染"],
  [html.includes("型号清单"), "型号清单渲染"],
  [html.includes("节目段落"), "段落管理渲染"],
  [html.includes("容量顺延"), "容量顺延冲突文案出现（样例自带冲突）"],
  [html.includes("安全距离"), "安全距离冲突文案出现"],
  [html.includes("超在点位"), "顺延说明超在哪个点位"],
  [html.includes("Chorus A"), "样例段落出现"],
];

// 引用一次确保模块树可加载
void StoreProvider;

let fail = 0;
for (const [ok, msg] of checks) {
  if (ok) console.log(`  ✓ ${msg}`);
  else { fail++; console.error(`  ✗ ${msg}`); }
}
console.log(`\nHTML 长度 ${html.length}`);
if (fail) process.exit(1);
