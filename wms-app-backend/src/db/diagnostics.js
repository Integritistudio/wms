const dns = require("dns");
const net = require("net");
const tls = require("tls");

function safeMessage(error) {
  return String(error?.message || error || "Unknown error")
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "[MongoDB URI redacted]");
}

function errorDetails(error) {
  return { name: error?.name, code: error?.code, syscall: error?.syscall, message: safeMessage(error) };
}

function targetFromUri(uri) {
  // Never return credentials or query parameters to the logger.
  const match = uri.match(/^(mongodb(?:\+srv)?):\/\/(?:[^@/]+@)?([^/?]+)(?:\/([^?]*))?/);
  if (!match) throw new Error("Invalid MongoDB URI format");
  return { srv: match[1] === "mongodb+srv", hosts: match[2].split(","), database: match[3] || "test" };
}

function probe(host, port, secure) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = secure
      ? tls.connect({ host, port, servername: host, family: 4, rejectUnauthorized: true })
      : net.connect({ host, port, family: 4 });
    let done = false;
    function finish(result) {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({ ...result, durationMs: Date.now() - started });
    }
    socket.setTimeout(5000, () => finish({ ok: false, code: "ETIMEDOUT", message: `${secure ? "TLS handshake" : "TCP connection"} exceeded 5000ms` }));
    socket.once("error", (error) => finish({ ok: false, ...errorDetails(error) }));
    socket.once(secure ? "secureConnect" : "connect", () => finish({ ok: true }));
  });
}

async function diagnose(uri, logger) {
  try {
    const target = targetFromUri(uri);
    let nodes;
    if (target.srv) {
      // A separate resolver bounds diagnostics even when public DNS is unreachable.
      const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
      resolver.setServers(dns.getServers());
      nodes = (await resolver.resolveSrv(`_mongodb._tcp.${target.hosts[0]}`))
        .map(({ name, port }) => ({ host: name, port }));
    } else {
      nodes = target.hosts.map((entry) => {
        const parsed = new URL(`http://${entry}`);
        return { host: parsed.hostname, port: Number(parsed.port || 27017) };
      });
    }
    logger.warn({ target, nodes, dnsServers: dns.getServers() }, "MongoDB diagnostics: configured target and DNS discovery");
    await Promise.all(nodes.slice(0, 3).map(async ({ host, port }) => {
      const tcp = await probe(host, port, false);
      const tlsResult = tcp.ok ? await probe(host, port, true) : { skipped: "TCP connection failed" };
      logger.warn({ host, port, tcp, tls: tlsResult,
        nextCheck: !tcp.ok
          ? "Check Atlas IP access list for this server's outbound IP, outbound firewall/provider rules, and cluster availability. A timeout alone cannot distinguish these."
          : !tlsResult.ok ? "Check TLS certificate trust, system clock, and network TLS interception."
            : "TCP and TLS succeeded. Check MongoDB authentication, replica set settings, and driver error details."
      }, "MongoDB diagnostics: node connectivity result");
    }));
  } catch (error) {
    logger.warn({ error: errorDetails(error) }, "MongoDB diagnostics: URI parsing or DNS discovery failed");
  }
}

module.exports = { diagnose, errorDetails, targetFromUri };
