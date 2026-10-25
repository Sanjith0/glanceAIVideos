import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/** Geist (SIL OFL), bundled under public/fonts. Resolves once every weight
 *  is registered; rendering is held until then. */
export const fontsReady: Promise<void> = Promise.all([
  loadFont({ family: "Geist", url: staticFile("fonts/Geist-Regular.woff2"), weight: "400" }),
  loadFont({ family: "Geist", url: staticFile("fonts/Geist-Medium.woff2"), weight: "500" }),
  loadFont({ family: "Geist", url: staticFile("fonts/Geist-SemiBold.woff2"), weight: "600" }),
]).then(() => undefined);
