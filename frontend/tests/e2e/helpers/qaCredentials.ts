const MOCK_QA_EMAIL = "mock.qa@alphavyuh.local";
const MOCK_QA_PASSWORD = "MockPass123!";

type QaCredentialOptions = {
  requireExplicit?: boolean;
};

export function qaCredentials(options: QaCredentialOptions = {}) {
  const email = process.env.PLAYWRIGHT_QA_EMAIL?.trim();
  const password = process.env.PLAYWRIGHT_QA_PASSWORD?.trim();

  if (options.requireExplicit && (!email || !password)) {
    throw new Error(
      "Production signed-in smoke requires PLAYWRIGHT_QA_EMAIL and PLAYWRIGHT_QA_PASSWORD.",
    );
  }

  return {
    email: email || MOCK_QA_EMAIL,
    password: password || MOCK_QA_PASSWORD,
  };
}
