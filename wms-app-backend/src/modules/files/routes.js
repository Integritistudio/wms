const service = require("./service");

function unlockPage(token, errorMessage) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Protected file</title>
    <style>
      body { font-family: sans-serif; background: #0c0b0a; color: #f3eee6; display: grid; min-height: 100vh; place-items: center; }
      form { background: #efe8dc; color: #161412; padding: 1.5rem; border-radius: 1rem; width: min(24rem, 92vw); }
      input, button { width: 100%; padding: 0.75rem; margin-top: 0.5rem; box-sizing: border-box; }
      button { background: #ff5a1f; color: white; border: 0; font-weight: 700; cursor: pointer; }
      p { color: #9b2c20; }
    </style>
  </head>
  <body>
    <form method="POST" action="/files/${token}">
      <h1>Password required</h1>
      ${errorMessage ? `<p>${errorMessage}</p>` : ""}
      <input type="password" name="password" required autofocus />
      <button type="submit">Download</button>
    </form>
  </body>
</html>`;
}

async function fileRoutes(app) {
  app.get("/files/:token", async (request, reply) => {
    const link = await service.findByToken(request.params.token);

    if (link.passwordHash) {
      reply.type("text/html");
      return unlockPage(link.token);
    }

    const unlocked = await service.unlock(link.token);
    return reply
      .header("Content-Type", unlocked.link.contentType)
      .header("Content-Disposition", `attachment; filename="${unlocked.link.fileName}"`)
      .send(unlocked.body);
  });

  app.post("/files/:token", async (request, reply) => {
    const password = request.body?.password;
    try {
      const unlocked = await service.unlock(request.params.token, password);
      return reply
        .header("Content-Type", unlocked.link.contentType)
        .header("Content-Disposition", `attachment; filename="${unlocked.link.fileName}"`)
        .send(unlocked.body);
    } catch (error) {
      if (error.statusCode === 401) {
        reply.type("text/html");
        return reply.status(401).send(unlockPage(request.params.token, "Wrong password"));
      }
      throw error;
    }
  });
}

module.exports = fileRoutes;
