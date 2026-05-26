import wixData from 'wix-data';

const WIDGET_URL = "https://rush-tree.github.io/one-million-km/strava-dashboard/widget.html";
const TARGET_TITLE = "Million Kilometers";

function sendWidgetUrl() {
  $w("#stravaWidget").postMessage({ type: "setUrl", url: WIDGET_URL });
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
