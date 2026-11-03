using EggsApp.Api.Data;
using EggsApp.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Tests.Data;

public sealed class AppDbContextTests : IDisposable
{
    private static readonly DateTime Created = new(2026, 11, 20, 8, 0, 0);
    private static readonly DateTime Later = new(2026, 11, 20, 17, 30, 0);

    private readonly TestDatabaseFolder _folder = new();
    private DateTime _now = Created;

    public AppDbContextTests()
    {
        using var db = CreateContext();
        db.Database.EnsureCreated();
    }

    public void Dispose() => _folder.Dispose();

    private SampleContext CreateContext() => new(_folder.Options(() => _now));

    private async Task<Sample> InsertAsync(string name = "first")
    {
        await using var db = CreateContext();
        var sample = new Sample { Name = name };
        db.Samples.Add(sample);
        await db.SaveChangesAsync();
        return sample;
    }

    [Fact]
    public void NewEntity_HasAKeyBeforeSaving()
    {
        Assert.NotEqual(Guid.Empty, new Sample().Id);
        Assert.NotEqual(new Sample().Id, new Sample().Id);
    }

    [Fact]
    public async Task Insert_SetsBothTimestampsAndSavesThemAsLocalTime()
    {
        var id = (await InsertAsync()).Id;

        await using var db = CreateContext();
        var saved = await db.Samples.SingleAsync(sample => sample.Id == id);

        Assert.Equal(Created, saved.CreatedAt);
        Assert.Equal(Created, saved.UpdatedAt);
        Assert.False(saved.IsDeleted);
    }

    [Fact]
    public void Insert_WithTheSynchronousSaveChanges_SetsTimestamps()
    {
        using var db = CreateContext();
        var sample = new Sample { Name = "sync" };
        db.Samples.Add(sample);

        db.SaveChanges();

        Assert.Equal(Created, sample.CreatedAt);
    }

    [Fact]
    public async Task Update_ChangesUpdatedAtOnly()
    {
        var id = (await InsertAsync()).Id;
        _now = Later;

        await using (var db = CreateContext())
        {
            var saved = await db.Samples.SingleAsync(sample => sample.Id == id);
            saved.Name = "changed";
            db.Entry(saved).Property(sample => sample.CreatedAt).CurrentValue = new DateTime(2000, 1, 1);
            await db.SaveChangesAsync();
        }

        await using var check = CreateContext();
        var updated = await check.Samples.SingleAsync(sample => sample.Id == id);

        Assert.Equal("changed", updated.Name);
        Assert.Equal(Created, updated.CreatedAt);
        Assert.Equal(Later, updated.UpdatedAt);
    }

    [Fact]
    public async Task Remove_KeepsTheRowAndHidesItFromQueries()
    {
        var id = (await InsertAsync()).Id;
        _now = Later;

        await using (var db = CreateContext())
        {
            db.Samples.Remove(await db.Samples.SingleAsync(sample => sample.Id == id));
            await db.SaveChangesAsync();
        }

        await using var check = CreateContext();
        Assert.Empty(await check.Samples.ToListAsync());

        var row = await check.Samples
            .IgnoreQueryFilters([AppDbContext.SoftDeleteFilter])
            .SingleAsync(sample => sample.Id == id);

        Assert.True(row.IsDeleted);
        Assert.Equal(Created, row.CreatedAt);
        Assert.Equal(Later, row.UpdatedAt);
    }

    [Fact]
    public async Task Filter_LeavesOtherRowsVisible()
    {
        var kept = await InsertAsync("kept");
        var removed = await InsertAsync("removed");

        await using (var db = CreateContext())
        {
            db.Samples.Remove(await db.Samples.SingleAsync(sample => sample.Id == removed.Id));
            await db.SaveChangesAsync();
        }

        await using var check = CreateContext();

        Assert.Equal(kept.Id, (await check.Samples.SingleAsync()).Id);
    }

    [Fact]
    public void Money_LongPropertyMapsToInteger()
    {
        using var db = CreateContext();

        var column = db.Model.FindEntityType(typeof(Sample))!.FindProperty(nameof(Sample.AmountInColones))!;

        Assert.Equal("INTEGER", column.GetColumnType());
    }

    [Theory]
    [InlineData(typeof(DecimalContext))]
    [InlineData(typeof(NullableDecimalContext))]
    public void Money_DecimalPropertyIsRejected(Type contextType)
    {
        using var db = (DbContext)Activator.CreateInstance(contextType, _folder.Options())!;

        var exception = Assert.Throws<InvalidOperationException>(() => db.Model);

        Assert.Contains("is decimal", exception.Message);
    }

    [Fact]
    public void Migrations_MatchTheModel()
    {
        // Otherwise MigrateAsync throws at startup, on the user's PC.
        using var db = new AppDbContext(_folder.Options());

        Assert.False(db.Database.HasPendingModelChanges());
    }

    public sealed class Sample : BaseEntity
    {
        public string Name { get; set; } = string.Empty;

        public long AmountInColones { get; set; }
    }

    // A test-only entity: the app has no business entities yet. EnsureCreated builds its table.
    private sealed class SampleContext(DbContextOptions options) : AppDbContext(options)
    {
        public DbSet<Sample> Samples => Set<Sample>();
    }

    public sealed class DecimalContext(DbContextOptions options) : AppDbContext(options)
    {
        public DbSet<DecimalEntity> Entities => Set<DecimalEntity>();

        public sealed class DecimalEntity : BaseEntity
        {
            public decimal Amount { get; set; }
        }
    }

    public sealed class NullableDecimalContext(DbContextOptions options) : AppDbContext(options)
    {
        public DbSet<NullableDecimalEntity> Entities => Set<NullableDecimalEntity>();

        public sealed class NullableDecimalEntity : BaseEntity
        {
            public decimal? Amount { get; set; }
        }
    }
}
