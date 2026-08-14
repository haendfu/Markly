// 构建时 base64 内嵌的 KaTeX 字体（仅导出功能使用，动态导入）
import AMS from "katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline";
import CaligraphicBold from "katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline";
import CaligraphicReg from "katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline";
import MainBold from "katex/dist/fonts/KaTeX_Main-Bold.woff2?inline";
import MainBoldItalic from "katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline";
import MainItalic from "katex/dist/fonts/KaTeX_Main-Italic.woff2?inline";
import MainReg from "katex/dist/fonts/KaTeX_Main-Regular.woff2?inline";
import MathBoldItalic from "katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline";
import MathItalic from "katex/dist/fonts/KaTeX_Math-Italic.woff2?inline";
import SansBold from "katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline";
import SansItalic from "katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline";
import SansReg from "katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline";
import Script from "katex/dist/fonts/KaTeX_Script-Regular.woff2?inline";
import Size1 from "katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline";
import Size2 from "katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline";
import Size3 from "katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline";
import Size4 from "katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline";
import Typewriter from "katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline";

export const fonts: Record<string, string> = {
  "KaTeX_AMS-Regular": AMS,
  "KaTeX_Caligraphic-Bold": CaligraphicBold,
  "KaTeX_Caligraphic-Regular": CaligraphicReg,
  "KaTeX_Main-Bold": MainBold,
  "KaTeX_Main-BoldItalic": MainBoldItalic,
  "KaTeX_Main-Italic": MainItalic,
  "KaTeX_Main-Regular": MainReg,
  "KaTeX_Math-BoldItalic": MathBoldItalic,
  "KaTeX_Math-Italic": MathItalic,
  "KaTeX_SansSerif-Bold": SansBold,
  "KaTeX_SansSerif-Italic": SansItalic,
  "KaTeX_SansSerif-Regular": SansReg,
  "KaTeX_Script-Regular": Script,
  "KaTeX_Size1-Regular": Size1,
  "KaTeX_Size2-Regular": Size2,
  "KaTeX_Size3-Regular": Size3,
  "KaTeX_Size4-Regular": Size4,
  "KaTeX_Typewriter-Regular": Typewriter,
};
