using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace EggsApp.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddExpenses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ExpenseCategories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    NeedsDescription = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsDeleted = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpenseCategories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Expenses",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExpenseDate = table.Column<DateOnly>(type: "TEXT", nullable: false),
                    CategoryId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Amount = table.Column<long>(type: "INTEGER", nullable: false),
                    Note = table.Column<string>(type: "TEXT", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    IsDeleted = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Expenses", x => x.Id);
                    table.CheckConstraint("CK_Expenses_AmountIsPositive", "\"Amount\" > 0");
                    table.ForeignKey(
                        name: "FK_Expenses_ExpenseCategories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "ExpenseCategories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                table: "ExpenseCategories",
                columns: new[] { "Id", "CreatedAt", "IsDeleted", "Name", "NeedsDescription", "SortOrder", "UpdatedAt" },
                values: new object[,]
                {
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0001"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Alimento", false, 10, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) },
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0002"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Vitaminas", false, 20, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) },
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0003"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Desparasitantes", false, 30, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) },
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0004"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Burucha", false, 40, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) },
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0005"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Cartones", false, 50, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) },
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0006"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Plásticos/Envoltorios", false, 60, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) },
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0007"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Equipo", false, 70, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) },
                    { new Guid("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0008"), new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified), false, "Otro", true, 80, new DateTime(2026, 11, 6, 0, 0, 0, 0, DateTimeKind.Unspecified) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExpenseCategories_Name",
                table: "ExpenseCategories",
                column: "Name",
                unique: true,
                filter: "\"IsDeleted\" = 0");

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_CategoryId",
                table: "Expenses",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_Expenses_ExpenseDate",
                table: "Expenses",
                column: "ExpenseDate");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Expenses");

            migrationBuilder.DropTable(
                name: "ExpenseCategories");
        }
    }
}
