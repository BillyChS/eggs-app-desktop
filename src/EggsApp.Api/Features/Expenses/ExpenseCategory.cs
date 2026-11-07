using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EggsApp.Api.Features.Expenses;

/// <summary>
/// What an expense was for. Categories are rows, not code, so one can be added, renamed or retired with data alone.
/// A retired category is soft-deleted: its expenses keep showing its name, and new expenses can't use it.
/// </summary>
public sealed class ExpenseCategory : BaseEntity
{
    public const int NameMaxLength = 40;

    public required string Name { get; set; }

    /// <summary>Where its button goes, lowest first.</summary>
    public int SortOrder { get; set; }

    /// <summary>True for "Otro": its expenses must say what they were.</summary>
    public bool NeedsDescription { get; set; }
}

internal sealed class ExpenseCategoryConfiguration : IEntityTypeConfiguration<ExpenseCategory>
{
    // Fixed, so the seed rows are the same in every database and a later migration can refer to them.
    private static readonly DateTime SeededAt = new(2026, 11, 6, 0, 0, 0, DateTimeKind.Unspecified);

    private static readonly (string Id, string Name)[] Seed =
    [
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0001", "Alimento"),
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0002", "Vitaminas"),
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0003", "Desparasitantes"),
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0004", "Burucha"),
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0005", "Cartones"),
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0006", "Plásticos/Envoltorios"),
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0007", "Equipo"),
        ("5d1f3c0e-6a51-4c39-9a0b-0f0c1e5a0008", "Otro"),
    ];

    /// <summary>The id of the seeded "Otro".</summary>
    public static readonly Guid OtherId = Guid.Parse(Seed[^1].Id);

    public void Configure(EntityTypeBuilder<ExpenseCategory> builder)
    {
        builder.Property(category => category.Name).HasMaxLength(ExpenseCategory.NameMaxLength);

        // Two active categories with one name would be two identical buttons. A retired one's name can be reused.
        builder.HasIndex(category => category.Name).IsUnique().HasFilter("\"IsDeleted\" = 0");

        builder.HasData(Seed.Select((row, index) => new
        {
            Id = Guid.Parse(row.Id),
            row.Name,
            SortOrder = (index + 1) * 10,
            NeedsDescription = Guid.Parse(row.Id) == OtherId,
            CreatedAt = SeededAt,
            UpdatedAt = SeededAt,
            IsDeleted = false,
        }));
    }
}
