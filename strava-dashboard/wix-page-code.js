import wixData from 'wix-data';

const WIDGET_BASE = "https://rush-tree.github.io/one-million-km/strava-dashboard/widget.html";
const TARGET_TITLE = "Million Kilometers";

// GitHub Pages serves widget.html with cache-control: max-age=600, and the
// iframe holds onto it longer still — so a redesign can stay invisible to
// visitors long after it went live. A per-hour cache key keeps the URL stable
// enough to cache usefully while guaranteeing changes surface within the hour.
function widgetUrl() {
  const hourKey = Math.floor(Date.now() / 3600000);
  return `${WIDGET_BASE}?v=${hourKey}`;
}

function sendWidgetUrl() {
  $w("#stravaWidget").postMessage({ type: "setUrl", url: widgetUrl() });
}

$w.onReady(function () {
  $w("#dynamicDataset").onReady(() => {
    const item = $w("#dynamicDataset").getCurrentItem();

    if (item && item.title === TARGET_TITLE) {
      // First attempt immediately
      sendWidgetUrl();

      // Retry after 500ms — covers mobile where HtmlComponent loads slower
      setTimeout(sendWidgetUrl, 500);

      // Listen for the HtmlComponent signalling it's ready
      $w("#stravaWidget").onMessage((event) => {
        if (event.data && event.data.type === "ready") {
          sendWidgetUrl();
        }
      });
    } else {
      $w("#stravaWidget").hide();
    }
  });
});
