# Multi-Role Authentication, Company Management, and RBAC Requirements

## 1. Multi-Role Login

The current system has a login flow intended only for **Company** users. This needs to be extended to support four user types:

1. **Admin**
2. **Company**
3. **Company User**
4. **Warehouse User**

The login screen should include a **user-type dropdown** allowing the user to select the appropriate login type.

The system should authenticate and authorize the user based on the selected user type and apply the relevant permissions after login.

---

## 2. Admin Access

The **Admin** role will retain the existing functionality and will have access to all available modules and features.

The Admin area is already completed.

In addition to the existing Admin functionality, the following Company Management functionality is required.

### Companies Page

A new **Companies** page should be available to Admin users.

The page should provide complete CRUD functionality:

- Create company
- View company
- Edit company
- Update company
- Soft delete company

Company deletion must be implemented as a **soft delete** rather than permanently removing the company from the database.

---

## 3. Automatic Permanent Deletion

Admin should have a **Settings** option to configure the cleanup process for soft-deleted records.

A scheduled cron job should permanently delete records that have remained soft-deleted for **six months**.

The six-month cleanup policy should also apply to **Returns** and their associated soft-deleted data.

The system should ensure that only records meeting the configured retention period are permanently deleted.

---

## 4. Company Signup and Approval Workflow

A public **Company Signup** functionality should be added.

### Signup

Companies should be able to register themselves by providing the required company details.

After signup:

- The company should be created with a **Pending** status.
- The company should not receive normal access until approved by an Admin.
- The pending company should appear in the Admin's company management area.

### Admin Approval

Admin should be able to review pending companies and either:

- **Approve** the company
- **Reject** the company

### Email Notifications

The company should receive an email notification after the Admin takes action.

- If approved → send an **approval email**.
- If rejected → send a **rejection email**.

Only approved companies should be able to access the Company portal.

---

## 5. Company Login

When a user logs in as a **Company**, all functionality currently available to the Company should remain accessible.

The following areas should **not** be accessible to Company users:

- Companies management
- Admin Settings
- Other Admin-only functionality

The existing Company functionality should otherwise remain unchanged.

---

## 6. Company Users and Warehouse Users

The existing **Users** page should be extended to support role-based access control.

Company users should be able to create and manage users belonging to their company.

Two user types should be supported:

- **Company User**
- **Warehouse User**

---

## 7. RBAC / Permission Management

When creating or editing a Company User or Warehouse User, the Company should be able to assign permissions.

The following modules should be available as permission options:

- Orders
- Returns
- Failed
- Warehouses
- SFTP
- Routing
- Email Settings

The Company should be able to enable or disable access to each module independently for a user.

For example, a Company User could be given:

- Orders: Yes
- Returns: Yes
- Failed: No
- Warehouses: No
- SFTP: No
- Routing: No
- Email Settings: No

The system should enforce these permissions throughout the application so that users cannot access modules for which they do not have permission.

---

## 8. Company User

A **Company User** belongs to a specific Company.

A Company User can access the modules that have been explicitly assigned through RBAC.

When a Company User has permission for a module, they should be able to access the company's relevant data according to the existing application functionality.

For example, if a Company User has access to Orders, they can view and work with the company's orders across the applicable warehouses.

---

## 9. Warehouse User

A **Warehouse User** also belongs to a specific Company but must additionally be assigned to a specific **Warehouse**.

The Warehouse User should only be able to access data associated with their assigned warehouse.

This warehouse-level restriction should apply to:

- Orders
- Returns
- Failed

For example, if a Warehouse User is assigned to **Warehouse A**, the user should only see Orders, Returns, and Failed records belonging to Warehouse A.

The Warehouse User must not be able to view or access records belonging to other warehouses, even if the user has permission for the corresponding module.

---

## 10. Role and Data Access Rules

The overall access model should work as follows:

| User Type          | Access Scope                                                                            |
| ------------------ | --------------------------------------------------------------------------------------- |
| **Admin**          | Full system access                                                                      |
| **Company**        | Full access to its company's functionality, excluding Admin-only Companies and Settings |
| **Company User**   | Company-level access based on assigned RBAC permissions                                 |
| **Warehouse User** | Assigned-company + assigned-warehouse access based on RBAC permissions                  |

For **Warehouse Users**, RBAC determines **which modules** they can access, while the assigned warehouse determines **which data** they can see within Orders, Returns, and Failed.

---

## 11. Overall Workflow

### Admin

**Admin Login → Full System Access → Companies Management → Approve/Reject Companies → Manage Settings**

### Company Signup

**Company Signup → Pending Status → Admin Review → Approve/Reject → Email Notification**

### Company

**Company Login → Existing Company Features → No Companies Management → No Admin Settings**

### Company User

**Company Login → User Login → RBAC Validation → Access Assigned Modules → Company-Level Data**

### Warehouse User

**Warehouse Login → User Login → RBAC Validation → Access Assigned Modules → Assigned Warehouse Data Only**

---

## 12. Implementation Summary

The system should therefore support:

- Multi-role login with Admin, Company, Company User, and Warehouse User.
- Existing Admin functionality remains unchanged.
- New Admin Companies management page with CRUD operations.
- Soft deletion for Companies.
- Configurable six-month cleanup through a cron job.
- Soft-deletion retention and cleanup for Returns as well.
- Public Company Signup.
- Pending Company approval workflow.
- Admin approval/rejection of Companies.
- Email notifications for approval and rejection.
- Existing Company functionality remains available after Company login.
- Admin-only Companies and Settings remain inaccessible to Companies.
- Company User and Warehouse User management.
- RBAC permissions for Orders, Returns, Failed, Analytics, Warehouses, SFTP, Routing, and Email Settings.
- Company Users have company-level access based on their assigned permissions.
- Warehouse Users are assigned to a specific warehouse.
- Warehouse Users can only access Orders, Returns, and Failed data belonging to their assigned warehouse.
- Backend/API-level authorization must enforce all role and permission restrictions, not just hide frontend pages or menu items.
