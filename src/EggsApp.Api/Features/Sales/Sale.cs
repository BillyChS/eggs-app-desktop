using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EggsApp.Api.Features.Sales;

/// <summary>
/// One purchase, like an invoice. Everything that belongs to the purchase as a whole goes here, so that later one
/// purchase is one entry in a customer's account. A cash sale counts as income on <see cref="SaleDate"/>.
/// </summary>
public sealed class Sale : BaseEntity
{
    /// <summary>The day of the sale, not the day it was typed in. Has no time, so no time zone can move it a day.</summary>
    public DateOnly SaleDate { get; set; }

    /// <summary>The sum of the lines: what was actually charged.</summary>
    public long Total { get; set; }

    public List<SaleItem> Items { get; } = [];
}

/// <summary>What the two carton sizes are called in the data: A holds 15 eggs and B holds 30.</summary>
public enum CartonType
{
    A,
    B,
}

/// <summary>One line of a sale. The price is kept on the line because it changes from sale to sale.</summary>
public sealed class SaleItem : BaseEntity
{
    public const int MaxPerSale = 20;
    public const long MaxQuantity = 10_000;
    public const long MaxUnitPrice = 1_000_000;

    public Guid SaleId { get; init; }

    public Sale Sale { get; init; } = null!;

    /// <summary>The order the lines were entered in. All the lines of a sale have the same CreatedAt.</summary>
    public int Position { get; init; }

    public CartonType CartonType { get; init; }

    public long Quantity { get; init; }

    public long UnitPrice { get; init; }

    public long LineTotal { get; init; }
}

internal sealed class SaleConfiguration : IEntityTypeConfiguration<Sale>
{
    public void Configure(EntityTypeBuilder<Sale> builder)
    {
        builder.HasIndex(sale => sale.SaleDate);

        // Nothing is ever really deleted: DeleteSale soft-deletes the lines along with the sale.
        builder.HasMany(sale => sale.Items)
            .WithOne(item => item.Sale)
            .HasForeignKey(item => item.SaleId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class SaleItemConfiguration : IEntityTypeConfiguration<SaleItem>
{
    public void Configure(EntityTypeBuilder<SaleItem> builder) =>
        builder.Property(item => item.CartonType).HasConversion<string>().HasMaxLength(1);
}
