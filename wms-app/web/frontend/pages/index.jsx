import { Page, Layout, Card, Text, TextContainer } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import "./synovia.css";

export default function HomePage() {
  return (
    <Page>
      <TitleBar title="Synovia" />
      <div className="synovia-home">
        <header className="synovia-brand"><img className="synovia-wordmark" src="/brand/synovia-logo.svg" alt="Synovia" width="175" height="50" /><small>Shopify &amp; warehouse operations</small></header>
        <div className="synovia-intro">
          <p className="synovia-eyebrow">Your fulfillment connection</p>
          <h1>Keep your store and warehouse in sync.</h1>
          <p>Connect Shopify to your warehouse workflow, from incoming orders to shipment tracking.</p>
        </div>
        <Layout>
          <Layout.Section>
            <Card sectioned>
              <TextContainer>
                <Text as="h2" variant="headingMd">Welcome to Synovia</Text>
                <p>Manage store connections, warehouse links, stock, and order routing in your company portal.</p>
                <div className="synovia-note"><strong>Complete your store setup</strong><p>Company Root must add this Shopify domain under Stores &amp; Warehouses and link the warehouses that will fulfill your orders.</p></div>
                <div className="synovia-flow" aria-label="Fulfillment workflow"><span>Shopify orders</span><span aria-hidden="true">&rarr;</span><span>Warehouse fulfillment</span><span aria-hidden="true">&rarr;</span><span>Shipment tracking</span></div>
              </TextContainer>
            </Card>
          </Layout.Section>
          <Layout.Section secondary>
            <Card sectioned>
              <Text as="h2" variant="headingMd">Connection checklist</Text>
              <ol className="synovia-checklist">
                <li><strong>Add your store</strong><p>Register the Shopify domain in your company portal.</p></li>
                <li><strong>Authorize Synovia</strong><p>Complete installation from Shopify Admin.</p></li>
                <li><strong>Link your warehouses</strong><p>Review stock, location mappings, and routing.</p></li>
              </ol>
            </Card>
          </Layout.Section>
        </Layout>
        <footer className="synovia-footer">WMS inventory is the source of truth. Review mappings before syncing.</footer>
      </div>
    </Page>
  );
}
