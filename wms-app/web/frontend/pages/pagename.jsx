import { Card, Page, Layout, TextContainer, Text } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import "./synovia.css";

export default function SetupGuide() {
  return (
    <Page>
      <TitleBar title="Synovia setup guide" />
      <header className="synovia-brand"><img className="synovia-wordmark" src="/brand/synovia-logo.svg" alt="Synovia" width="175" height="50" /><small>Store connection guide</small></header>
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <TextContainer>
              <Text variant="headingMd" as="h1">Connect your store to fulfillment</Text>
              <p>Company Root completes these steps in the company portal. Open Synovia from Shopify Admin when authorizing the connection.</p>
              <ol>
                <li>Add your myshopify.com domain under Stores &amp; Warehouses.</li>
                <li>Complete the Shopify app installation and authorization.</li>
                <li>Link warehouses and map the Shopify inventory locations.</li>
                <li>Verify SKU quantities, configure routing, and check the completed inventory sync result.</li>
                <li>Test an order through warehouse assignment, shipment, and Shopify fulfillment sync.</li>
              </ol>
            </TextContainer>
          </Card>
        </Layout.Section>
        <Layout.Section secondary>
          <Card sectioned>
            <TextContainer>
              <Text variant="headingMd" as="h2">Before syncing inventory</Text>
              <p>WMS quantities replace Shopify stock at mapped locations. Products missing from WMS receive zero stock. Confirm mappings and quantities first.</p>
              <Text variant="headingMd" as="h2">Need help?</Text>
              <p>Use the User Guide in your company portal or ask Company Root to verify the store connection and warehouse links.</p>
            </TextContainer>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
