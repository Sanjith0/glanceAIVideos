import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);

// Headless cloud rendering: use the system Chrome and software WebGL (ANGLE
// over SwiftShader) so the Three.js scene renders without a GPU.
Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? "/opt/google/chrome/chrome");
Config.setChromiumOpenGlRenderer("swangle");
Config.setDelayRenderTimeoutInMilliseconds(180_000);
Config.setConcurrency(1);
Config.setCodec("h264");
Config.setCrf(16);
Config.setPixelFormat("yuv420p");
