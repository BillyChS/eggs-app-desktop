using System.Linq.Expressions;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Expenses;
using EggsApp.Api.Features.Payments;
using EggsApp.Api.Features.Sales;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Data;

public class AppDbContext(DbContextOptions options) : DbContext(options)
{
    /// <summary>Pass this to IgnoreQueryFilters to also read soft-deleted rows.</summary>
    public const string SoftDeleteFilter = "SoftDelete";

    public DbSet<Customer> Customers => Set<Customer>();

    public DbSet<Sale> Sales => Set<Sale>();

    public DbSet<SaleItem> SaleItems => Set<SaleItem>();

    public DbSet<Payment> Payments => Set<Payment>();

    public DbSet<ExpenseCategory> ExpenseCategories => Set<ExpenseCategory>();

    public DbSet<Expense> Expenses => Set<Expense>();

    /// <summary>The one place that defines how the app connects to its database.</summary>
    public static void Configure(DbContextOptionsBuilder options, string databasePath, Func<DateTime>? now = null)
    {
        var connection = new SqliteConnectionStringBuilder
        {
            DataSource = databasePath,
            ForeignKeys = true,
        };

        options
            .UseSqlite(connection.ToString())
            .AddInterceptors(new AuditInterceptor(now), new SqlitePragmaInterceptor());
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes().ToList())
        {
            RejectDecimalProperties(entityType.ClrType, entityType.GetProperties());

            // Inheritance hierarchies take the filter on their root type only.
            if (entityType.ClrType.IsAssignableTo(typeof(BaseEntity)) && entityType.BaseType is null)
            {
                var entity = modelBuilder.Entity(entityType.ClrType);
                entity.Property(nameof(BaseEntity.Id)).ValueGeneratedNever();
                entity.HasQueryFilter(SoftDeleteFilter, IsNotDeleted(entityType.ClrType));
            }
        }
    }

    private static LambdaExpression IsNotDeleted(Type entityType)
    {
        var entity = Expression.Parameter(entityType, "entity");
        return Expression.Lambda(Expression.Not(Expression.Property(entity, nameof(BaseEntity.IsDeleted))), entity);
    }

    // Money is stored as long, in whole colones, because SQLite can't aggregate decimal. Failing here stops the
    // mistake at "dotnet ef migrations add", before it reaches a table.
    private static void RejectDecimalProperties(
        Type entityType,
        IEnumerable<Microsoft.EntityFrameworkCore.Metadata.IMutableProperty> properties)
    {
        var offending = properties.FirstOrDefault(property =>
            (Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType) == typeof(decimal));

        if (offending is not null)
        {
            throw new InvalidOperationException(
                $"{entityType.Name}.{offending.Name} is decimal. Store money as long, in whole colones.");
        }
    }
}
