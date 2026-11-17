// Keep the initial React boot screen truthful if the application bundle fails to start.
window.setTimeout(function () {
  var status = document.getElementById('boot-status');
  var message = document.getElementById('boot-message');
  if (status && message) {
    message.textContent = 'The application did not start. Check your connection, then reload. Backend and account status have not been verified.';
  }
}, 12000);

// Surface startup failures instead of leaving a permanent loading screen.
function showStartupFailure(message) {
  var status = document.getElementById('boot-status');
  var bootMessage = document.getElementById('boot-message');
  if (!status || !bootMessage) return;
  bootMessage.textContent = message;
  status.setAttribute('data-startup-state', 'failed');
}

window.addEventListener('error', function (event) {
  var target = event.target;
  if (target && target.tagName === 'SCRIPT' && target.type === 'module') {
    showStartupFailure('The frontend entry module failed to load. Check the deployed asset path and Worker build. Live services remain unverified.');
    return;
  }
  if (event instanceof ErrorEvent && event.message) {
    showStartupFailure('Frontend startup encountered a JavaScript error. Reload once; if it persists, inspect browser console and deployment logs. Live services remain unverified.');
  }
}, true);

window.addEventListener('unhandledrejection', function () {
  showStartupFailure('Frontend startup encountered an unhandled asynchronous error. Inspect browser console and deployment logs. Live services remain unverified.');
});
