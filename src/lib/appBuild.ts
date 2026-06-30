export const APP_BUILD = {
  id: __APP_BUILD_ID__,
  mode: __APP_BUILD_MODE__,
};

export function logAppBuild() {
  console.info(`[FleetDesk] build=${APP_BUILD.id} mode=${APP_BUILD.mode}`);
}
