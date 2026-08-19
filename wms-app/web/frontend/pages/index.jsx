import { Page, Layout, Card, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function HomePage() {
  return (
    <Page>
      <TitleBar title="WMS Linker" />
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">
              Connected to WMS Linker
            </Text>
            <p>
              This app is a connector. Orders flow to the WMS backend once the
              shop domain is allowlisted by the platform admin.
            </p>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
