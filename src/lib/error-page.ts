export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #06110C; color: #F2EDE3; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { position: relative; max-width: 28rem; width: 100%; text-align: center; padding: 2.25rem; background: #0B1912; border: 1px solid #1C3529; border-radius: 1rem; overflow: hidden; }
      .card::before { content: ""; position: absolute; inset: 0 0 auto; height: 3px; background: #A31C1B; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #9BA79D; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.5rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #C7B99B; color: #06110C; }
      .secondary { background: #10231B; color: #F2EDE3; border-color: #1C3529; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
