import type { GuideSection } from './UserGuidePanel'

export const ADDITIONAL_GUIDE_SECTIONS: GuideSection[] = [
  {
    "id": "access",
    "title": "Sign in and account recovery",
    "summary": "Activate your invitation and use /account/login for company operations.",
    "options": [
      {
        "label": "Invitations",
        "meaning": "Open the supplied invitation link and set your password. Keep invite and reset links private."
      },
      {
        "label": "Company signup",
        "meaning": "Public signups require platform approval before normal access."
      },
      {
        "label": "Forgot password",
        "meaning": "Use the company login recovery link, enter your email, and follow the reset instructions."
      },
      {
        "label": "Missing access",
        "meaning": "Ask Company Root to check active status, module permissions, and assigned warehouses. Permission and warehouse scope both apply."
      },
      {
        "label": "Other portals",
        "meaning": "Warehouse uploaders use /u for assigned shipping tasks. Platform operators use their separate administrator console for company approvals and platform settings."
      }
    ],
    "workflows": [],
    "tips": []
  },
  {
    "id": "stores",
    "title": "Connect Shopify stores",
    "summary": "Stores & Warehouses includes store installation, warehouse links, inventory mappings, and sync results.",
    "options": [
      {
        "label": "Add store",
        "meaning": "Enter the myshopify.com domain, then complete the app installation."
      },
      {
        "label": "Connected warehouses",
        "meaning": "Select the warehouses supplying the store. Available SKU quantities are summed across connected warehouses."
      },
      {
        "label": "Store enabled",
        "meaning": "Disable to pause inventory sync and routing for this shop."
      },
      {
        "label": "WMS push hold override",
        "meaning": "Inherit the company default, force on with an optional minutes override, or force off."
      },
      {
        "label": "Awaiting install",
        "meaning": "Store registration exists but installation is incomplete."
      },
      {
        "label": "Sync pending / Sync issue",
        "meaning": "Queued work is not a completed sync. Open the result to inspect progress or errors."
      }
    ],
    "workflows": [
      {
        "title": "Connect a store",
        "steps": [
          "Add the store and complete installation.",
          "Edit the store, link warehouses, and configure the Shopify location mapping.",
          "Verify WMS stock before acknowledging the inventory overwrite warning and saving. Saving queues a sync.",
          "Inspect the sync result and verify a known SKU at the mapped Shopify location."
        ]
      }
    ],
    "tips": [],
    "href": "/account/warehouses"
  },
  {
    "id": "inventory-sync",
    "title": "Inventory and shared stock",
    "summary": "Warehouse inventory supports allocation and Shopify stock for connected stores.",
    "options": [
      {
        "label": "On hand",
        "meaning": "Physical quantity recorded for the SKU at the warehouse."
      },
      {
        "label": "Reserved",
        "meaning": "Quantity committed to open allocations."
      },
      {
        "label": "Available",
        "meaning": "Stock available for new work; review separately from on hand and reserved."
      },
      {
        "label": "Add to stock",
        "meaning": "Increase quantity by the entered adjustment."
      },
      {
        "label": "Set on-hand",
        "meaning": "Replace the recorded total. Enter the physical total, not the adjustment."
      },
      {
        "label": "Shop / Shopify location",
        "meaning": "Select the store and inventory location mapping where offered in the inventory editor."
      },
      {
        "label": "Sync Shopify inventory",
        "meaning": "WMS quantities overwrite stock at mapped Shopify locations. Products missing from WMS receive zero stock and may become unavailable. Products are not deleted."
      },
      {
        "label": "Inventory sync result",
        "meaning": "Check pending, in-progress, failure, completion, SKUs processed, location updates, and last completed time. An earlier success does not prove the latest request completed."
      }
    ],
    "workflows": [
      {
        "title": "Update and verify inventory",
        "steps": [
          "Check exact SKU spelling against Shopify variants.",
          "Update warehouse stock, or sync from ModernWMS when it is the source.",
          "Verify reservations, available stock, connected warehouses, and location mappings.",
          "Review the overwrite warning and start sync. Avoid changing products, inventory, links, or Shopify settings during sync.",
          "Wait for completion and compare a known SKU in Shopify."
        ]
      }
    ],
    "tips": [
      "Multiple stores can consume the same warehouse pool. Plan using shared availability rather than treating each store as independent stock."
    ],
    "href": "/account/warehouses"
  },
  {
    "id": "backorders",
    "title": "Backorders and routing checks",
    "summary": "Route a specific continue-selling SKU that is short of stock to its intended warehouse.",
    "options": [
      {
        "label": "Require all items in stock",
        "meaning": "Requires sufficient stock at the rule target. Leave off for backorder routing."
      },
      {
        "label": "Continue-selling SKU short of stock (target warehouse)",
        "meaning": "Use this condition with the specific SKU. Confirm its continue-selling product link is current."
      },
      {
        "label": "Warehouse priority",
        "meaning": "Ranks eligible candidates together with stock thresholds and the selected postal/distance method."
      },
      {
        "label": "Rules",
        "meaning": "Specific rules should precede broad rules. Clear filters before using drag or arrow reorder controls."
      }
    ],
    "workflows": [
      {
        "title": "Create a backorder rule",
        "steps": [
          "Confirm the product allows continued selling and its store product link is current.",
          "Choose the target warehouse and add the continue-selling SKU short-of-stock condition.",
          "Leave Require all items in stock off and save the rule ahead of broader matches.",
          "Check an applicable order, its allocation, and activity. Routing does not create physical stock."
        ]
      }
    ],
    "tips": [],
    "href": "/account/routing"
  },
  {
    "id": "tracking",
    "title": "Auto Tracking with Shipoo",
    "summary": "Carrier events advance shipment timelines. Company Root and users with Tracking permission can access this module.",
    "options": [
      {
        "label": "Enable auto-tracking",
        "meaning": "New shipments register with Shipoo when enabled; carrier events update their timeline."
      },
      {
        "label": "Shipoo API key",
        "meaning": "Registration credential. Saved values are masked; leave blank to retain a saved key."
      },
      {
        "label": "Webhook signing secret",
        "meaning": "Secret supplied for the Shipoo destination. Leave blank to retain the saved secret."
      },
      {
        "label": "Destination ID",
        "meaning": "Optional Shipoo destination identifier."
      },
      {
        "label": "Inbound webhook URL",
        "meaning": "Copy into a Shipoo destination for tracking events."
      },
      {
        "label": "Last webhook",
        "meaning": "Latest received webhook time when available. Refresh reloads settings."
      }
    ],
    "workflows": [
      {
        "title": "Enable carrier updates",
        "steps": [
          "Ask the platform operator to configure Shipoo if the page reports a missing base URL.",
          "Copy the inbound URL and create a tracking-event destination in Shipoo.",
          "Enter the API key, destination secret, and optional destination ID. Enable and save.",
          "Grant operators Tracking permission in Users.",
          "Ship with valid tracking and inspect the order timeline for carrier events."
        ]
      }
    ],
    "tips": [
      "Shipment stage and order fulfillment status differ: a fulfilled order can still be in transit.",
      "Do not assume enabling tracking registers older shipments; inspect their events."
    ],
    "href": "/account/tracking"
  },
  {
    "id": "checklist",
    "title": "Go-live checklist and daily routine",
    "summary": "Verify the complete order-to-shipment loop before live volume.",
    "options": [],
    "workflows": [
      {
        "title": "Before go-live",
        "steps": [
          "Activate the company and invite users with appropriate modules and warehouse scope.",
          "Create warehouses, addresses, fulfillment modes, and inventory. Test SFTP or ModernWMS credentials.",
          "Install stores, link warehouses, map locations, and verify completed inventory sync.",
          "Configure routing rules, priority, fallback, partial policy, and the Shopify edit hold.",
          "Configure email alerts and optional Shipoo tracking.",
          "Test assignment, allocation, warehouse handoff, shipment confirmation, and Shopify fulfillment sync. Include a shortage or split case if used."
        ]
      },
      {
        "title": "Daily operations",
        "steps": [
          "Review Analytics for failures, unassigned orders, holds, and open returns.",
          "Check Orders for suggestions needing acceptance, pending holds, and shipments awaiting Shopify sync.",
          "Correct causes before retrying Failed entries.",
          "Receive and inspect returns; restock eligible goods only.",
          "Review stock sync results, tracking exceptions, and notifications before shift handover."
        ]
      }
    ],
    "tips": []
  },
  {
    "id": "troubleshooting",
    "title": "Troubleshooting and exceptions",
    "summary": "Read the order activity and exact error, correct the cause, then retry the affected step.",
    "options": [
      {
        "label": "Order missing",
        "meaning": "Clear filters, verify store and warehouse scope. Ask an administrator to check installation and webhook processing if it was never received."
      },
      {
        "label": "No warehouse / Needs accept",
        "meaning": "Check routing enabled status, rules, store links, stock, and fallback. Accept a suggestion if auto-assignment is off."
      },
      {
        "label": "Allocated but no warehouse work",
        "meaning": "Check the Shopify edit hold, fulfillment mode, SFTP delivery or ModernWMS dispatch, and activity."
      },
      {
        "label": "SFTP failed",
        "meaning": "Test the named connection and verify credentials, remote path, enabled status, and warehouse attachment before retrying."
      },
      {
        "label": "ModernWMS failed",
        "meaning": "Test credentials and inspect SKU, customer, tenant, and dispatch error details."
      },
      {
        "label": "Shopify fulfillment not synced",
        "meaning": "Confirm the group shipped with valid tracking; read the error and use Push / Re-sync when offered."
      },
      {
        "label": "945 rejected",
        "meaning": "Confirm order and group, compare with the sample 945, and check quantities, SKUs, and tracking."
      },
      {
        "label": "Return did not restock",
        "meaning": "Check received quantities, disposition Restock, and warehouse. For ModernWMS verify goods owner and putaway prerequisites."
      },
      {
        "label": "Email missing",
        "meaning": "Check Enabled, recipients, event toggles, SMTP, and a test email."
      },
      {
        "label": "Tracking not advancing",
        "meaning": "Check company enablement, user permission, tracking number, Shipoo destination, secret, and latest webhook."
      },
      {
        "label": "Wrong warehouse",
        "meaning": "Before shipment, use Clear allocation when available, then reassign. Inspect groups before changing shipped work."
      }
    ],
    "workflows": [],
    "tips": [
      "Closing a failure skips processing; it does not fulfill the order or correct stock.",
      "When escalating, include store, order reference, warehouse, group, time, error, and actions tried. Omit credentials."
    ]
  },
  {
    "id": "glossary",
    "title": "Glossary and workflow boundaries",
    "summary": "Terms used throughout warehouse and commerce workflows.",
    "options": [
      {
        "label": "EDI 940",
        "meaning": "Outbound warehouse shipping instruction."
      },
      {
        "label": "EDI 945 / ASN",
        "meaning": "Warehouse shipping confirmation with quantities and tracking."
      },
      {
        "label": "Fulfillment group",
        "meaning": "Warehouse-specific allocated lines; split orders may have multiple groups and shipments."
      },
      {
        "label": "DLQ",
        "meaning": "Dead-letter queue, shown as Failed."
      },
      {
        "label": "RMA",
        "meaning": "Return merchandise authorization."
      },
      {
        "label": "RTS",
        "meaning": "Return to sender."
      },
      {
        "label": "Shopify sync",
        "meaning": "Inventory sync updates quantities. Fulfillment sync reports shipped work and tracking."
      },
      {
        "label": "Refunded return",
        "meaning": "A workflow status. Handle the actual financial refund in the appropriate commerce/payment system; creating an RMA does not issue money."
      }
    ],
    "workflows": [],
    "tips": [
      "For SFTP shipments use the available ship or 945 upload action; do not assume inbound files are automatically collected.",
      "Process diagrams illustrate split fulfillment and integration exceptions."
    ]
  }
]
