using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EggsApp.Api.Data.Migrations
{
    /// <summary>
    /// Credit sales and abonos. Edited by hand: for the foreign key and check on Sales, EF rebuilds the table across
    /// three transactions with foreign keys off in between, so a crash there would leave a half-migrated database.
    /// SQLite can add both with the columns instead, and then the whole migration is one transaction. Every existing
    /// sale becomes a cash sale with no customer, which is what it was.
    /// </summary>
    public partial class AddCreditSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsCredit",
                table: "Sales",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            // After IsCredit, which its check reads. A column-level check may name other columns of the row.
            migrationBuilder.Sql(
                """
                ALTER TABLE "Sales" ADD "CustomerId" TEXT NULL
                    CONSTRAINT "FK_Sales_Customers_CustomerId" REFERENCES "Customers" ("Id") ON DELETE RESTRICT
                    CONSTRAINT "CK_Sales_CreditHasCustomer" CHECK (("IsCredit" = 0 AND "CustomerId" IS NULL) OR ("IsCredit" = 1 AND "CustomerId" IS NOT NULL));
                """);

            migrationBuilder.CreateTable(
                name: "Payments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    PaymentDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    Amount = table.Column<long>(type: "INTEGER", nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsDeleted = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payments", x => x.Id);
                    table.CheckConstraint("CK_Payments_AmountIsPositive", "\"Amount\" > 0");
                    table.ForeignKey(
                        name: "FK_Payments_Customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "Customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Sales_CustomerId",
                table: "Sales",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_CustomerId",
                table: "Payments",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_PaymentDate",
                table: "Payments",
                column: "PaymentDate");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Sales_CustomerId",
                table: "Sales");

            // SQLite drops a column only when nothing constrains it, so the table is rebuilt without both.
            migrationBuilder.DropForeignKey(
                name: "FK_Sales_Customers_CustomerId",
                table: "Sales");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Sales_CreditHasCustomer",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "Sales");

            migrationBuilder.DropColumn(
                name: "IsCredit",
                table: "Sales");
        }
    }
}
