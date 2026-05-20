import 'element-plus/dist/index.css';
import './cadViewer.css';

import ElementPlus from 'element-plus';
import { createApp } from 'vue';
import { i18n, MlCadViewer } from '@mlightcad/cad-viewer';
import { AcApDocManager, AcApSettingManager, AcEdOpenMode } from '@mlightcad/cad-simple-viewer';

const params = new URLSearchParams(window.location.search);
const cadUrlParam = params.get('url') || undefined;
const cadUrl = cadUrlParam ? new URL(cadUrlParam, window.location.origin).href : undefined;
const cadName = params.get('name') || 'CAD Viewer';

document.querySelector('[data-cad-title]').textContent = cadName;
document.querySelector('[data-cad-source]').textContent = cadUrl ? 'DWG/DXF loaded from project uploads' : 'Use the viewer menu to open a local DWG/DXF';

AcApSettingManager.instance.isShowCommandLine = false;
AcApSettingManager.instance.isShowStats = false;
AcApSettingManager.instance.isShowEntityInfo = true;
AcApSettingManager.instance.isShowLanguageSelector = true;

function zoomToLoadedDrawing() {
  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    try {
      AcApDocManager.instance.curView.zoomToFitDrawing(1000);
    } catch {
      // Viewer is still booting.
    }
    if (attempts >= 30) window.clearInterval(timer);
  }, 1000);
}

const app = createApp(MlCadViewer, {
  url: cadUrl,
  locale: 'en',
  theme: 'light',
  mode: AcEdOpenMode.Read,
  background: 0xf7faf8,
  useMainThreadDraw: false
});

app.use(i18n);
app.use(ElementPlus);
app.mount('#cad-viewer-app');
zoomToLoadedDrawing();
