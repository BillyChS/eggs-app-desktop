using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EggsApp.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentForSale : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ForSaleId",
                table: "Payments",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Payments_ForSaleId",
                table: "Payments",
                column: "ForSaleId");

            migrationBuilder.AddForeignKey(
                name: "FK_Payments_Sales_ForSaleId",
                table: "Payments",
                column: "ForSaleId",
                principalTable: "Sales",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Payments_Sales_ForSaleId",
                table: "Payments");

            migrationBuilder.DropIndex(
                name: "IX_Payments_ForSaleId",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "ForSaleId",
                table: "Payments");
        }
    }
}
