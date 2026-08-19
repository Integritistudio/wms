const { sendMail } = require("../../utils/mail");

async function sendDownloadLink({ to, subject, url, passwordRequired }) {
  const text = `Download: ${url}${passwordRequired ? "\nThis link is password protected." : ""}`;
  return sendMail({
    to,
    subject: subject || "WMS Linker file",
    text,
  });
}

module.exports = {
  sendDownloadLink,
};
