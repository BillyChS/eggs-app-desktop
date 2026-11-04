using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EggsApp.Api.Features.Customers;

/// <summary>
/// Someone who buys eggs. Names aren't unique: two different people can both be "María", so there's no unique index
/// and a deleted customer's name can be used again. The UI warns about similar names instead (see CustomerNames).
/// </summary>
public sealed class Customer : BaseEntity
{
    public const int NameMaxLength = 100;
    public const int PhoneMaxLength = 30;
    public const int NotesMaxLength = 500;

    public required string Name { get; set; }

    public string? Phone { get; set; }

    public string? Notes { get; set; }
}

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.Property(customer => customer.Name).HasMaxLength(Customer.NameMaxLength);
        builder.Property(customer => customer.Phone).HasMaxLength(Customer.PhoneMaxLength);
        builder.Property(customer => customer.Notes).HasMaxLength(Customer.NotesMaxLength);
    }
}
