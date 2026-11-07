using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EggsApp.Api.Data.Migrations
{
    /// <summary>
    /// Ties an abono to the credit sale it was paid with, when it was paid as the sale was made. Edited by hand, like
    /// AddCreditSales: for the foreign key, EF would rebuild Payments across several transactions, but SQLite can add
    /// it with the column, so the whole migration is one transaction. Every existing abono gets no sale.
    /// </summary>
    public partial class LinkAbonosToSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                ALTER TABLE "Payments" ADD "SaleId" TEXT NULL
                    CONSTRAINT "FK_Payments_Sales_SaleId" REFERENCES "Sales" ("Id") ON DELETE RESTRICT;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_SaleId",
                table: "Payments",
                column: "SaleId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Payments_Sales_SaleId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_SaleId",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "SaleId",
                table: "Payments");
        }
    }
}
