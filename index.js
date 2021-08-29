const { google } = require("googleapis");
const { OAuth2Client } = require("google-auth-library");

const express = require("express");
const app = express();
const fs = require("fs");
const exec = require("await-exec");
const parser = require("./xmlParser.js");

const PORT = process.env.PORT || 5000;
app.use(express.json());
app.post("/processSnippets", async (req, res) => {
  return res.send({
    snippets: await getSnippets(req.body),
  });
});
app.listen(PORT, () => {
  console.log("Server started listening on port : ", PORT);
});

const getSnippets = async (req) => {
  try {
    await validateToken(req);
    const { OAuth2 } = google.auth;
    const auth = new OAuth2();
    auth.setCredentials(req.tokenObj);

    const gmail = google.gmail({ version: "v1", auth });

    const messageIds = await getMessageIds(gmail);
    const tempFileName = await writeMessageToFile(req, messageIds, gmail);
    let pmdRes = await getDuplicateSnippetsUsingPMD(tempFileName);
    deleteTempFile(tempFileName);

    const resJson = parser.parseXMLtoJSON(pmdRes);

    if (resJson && resJson["pmd-cpd"] && resJson["pmd-cpd"].duplication) {
      return resJson["pmd-cpd"].duplication.map((x) => x.codefragment.__cdata);
    } else {
      return [];
    }
  } catch (error) {
    console.log(error);
    throw new Error("Google token validation failed");
  }
};
function deleteTempFile(tempFileName) {
  if (fs.existsSync(tempFileName)) {
    fs.unlinkSync(tempFileName);
  }
}

async function getDuplicateSnippetsUsingPMD(tempFileName) {
  let pmdRes = "";
  try {
    const pmdRes = await exec(
      `pmd cpd --minimum-tokens 10  --files ${tempFileName} --language PL/SQL --format xml`
    );
  } catch (error) {
    console.error('pmd error',error)
    pmdRes = error.stdout;
  }
  return pmdRes;
}

async function writeMessageToFile(req, messageIds, gmail) {
  const tempFileName = req.googleId;
  for (let i = 0; i < messageIds.length; i++) {
    const res = await gmail.users.messages.get({
      format: "full",
      id: messageIds[i],
      metadataHeaders: [],
      userId: "me",
    });

    console.log(JSON.stringify(res.data.snippet,null,4))
    fs.appendFileSync(tempFileName, res.data.snippet);
    fs.appendFileSync(tempFileName, "\n \n");
  }
  return tempFileName;
}

async function validateToken(req) {
  const CLIENT_ID =
    "3306354262-290buf5n6lj0d7bggl13pceeg2iee9c3.apps.googleusercontent.com";
  const client = new OAuth2Client(CLIENT_ID);

  const ticket = await client.verifyIdToken({
    idToken: req.tokenId,
    audience: CLIENT_ID,
  });

  const payload = ticket.getPayload();
}

async function getMessageIds(gmail) {
  const res = await gmail.users.messages.list({
    includeSpamTrash: false,
    labelIds: ["SENT"],
    maxResults: 20,
    userId: "me",
  });

  const messageIds = res.data.messages.map((x) => x.id);
  return messageIds;
}
