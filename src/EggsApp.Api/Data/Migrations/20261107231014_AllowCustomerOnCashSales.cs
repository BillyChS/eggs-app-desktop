using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EggsApp.Api.Data.Migrations
{
    /// <summary>
    /// A cash sale may now name who bought it: CK_Sales_CreditHasCustomer only requires a customer on a credit sale.
    /// Every existing row already meets the new check.
    ///
    /// SQLite can't change a check without rebuilding the table. Written by hand because EF's rebuild spreads over
    /// three transactions, and a crash after the first would leave ef_temp_Sales behind and stop every later start.
    /// Here foreign keys go off (which SQLite only allows outside a transaction, so SaleItems and Payments keep
    /// pointing at "Sales" while it's swapped), and the whole rebuild, indexes included, is one transaction. If the
    /// app stops after it but before the migration is recorded, it simply runs again on the next start.
    /// </summary>
    public partial class AllowCustomerOnCashSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("PRAGMA foreign_keys = 0;", suppressTransaction: true);

            migrationBuilder.Sql(
                """
                DROP TABLE IF EXISTS "ef_temp_Sales";

                CREATE TABLE "ef_temp_Sales" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_Sales" PRIMARY KEY,
                    "CreatedAt" TEXT NOT NULL,
                    "CustomerId" TEXT NULL,
                    "IsCredit" INTEGER NOT NULL,
                    "IsDeleted" INTEGER NOT NULL,
                    "SaleDate" TEXT NOT NULL,
                    "Total" INTEGER NOT NULL,
                    "UpdatedAt" TEXT NOT NULL,
                    CONSTRAINT "CK_Sales_CreditHasCustomer" CHECK ("IsCredit" = 0 OR "CustomerId" IS NOT NULL),
                    CONSTRAINT "FK_Sales_Customers_CustomerId" FOREIGN KEY ("CustomerId") REFERENCES "Customers" ("Id") ON DELETE RESTRICT
                );

                INSERT INTO "ef_temp_Sales" ("Id", "CreatedAt", "CustomerId", "IsCredit", "IsDeleted", "SaleDate", "Total", "UpdatedAt")
                SELECT "Id", "CreatedAt", "CustomerId", "IsCredit", "IsDeleted", "SaleDate", "Total", "UpdatedAt"
                FROM "Sales";

                DROP TABLE "Sales";

                ALTER TABLE "ef_temp_Sales" RENAME TO "Sales";

                CREATE INDEX "IX_Sales_CustomerId" ON "Sales" ("CustomerId");

                CREATE INDEX "IX_Sales_SaleDate" ON "Sales" ("SaleDate");
                """);

            migrationBuilder.Sql("PRAGMA foreign_keys = 1;", suppressTransaction: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Only possible while no cash sale names a customer.
            migrationBuilder.DropCheckConstraint(
                name: "CK_Sales_CreditHasCustomer",
                table: "Sales");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Sales_CreditHasCustomer",
                table: "Sales",
                sql: "(\"IsCredit\" = 0 AND \"CustomerId\" IS NULL) OR (\"IsCredit\" = 1 AND \"CustomerId\" IS NOT NULL)");
        }
    }
}
