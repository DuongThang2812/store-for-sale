/// Quyền hạn của người dùng tại cửa hàng (StorePermissions DTO).
/// Khớp 100% với hợp đồng API đã thống nhất ở Phần 1.
class StorePermissions {
  final bool canSell;
  final bool canManageInventory;
  final bool canViewReports;
  final bool canManageStaff;

  const StorePermissions({
    required this.canSell,
    required this.canManageInventory,
    required this.canViewReports,
    required this.canManageStaff,
  });

  factory StorePermissions.fromJson(Map<String, dynamic> json) {
    return StorePermissions(
      canSell: json['canSell'] as bool? ?? false,
      canManageInventory: json['canManageInventory'] as bool? ?? false,
      canViewReports: json['canViewReports'] as bool? ?? false,
      canManageStaff: json['canManageStaff'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'canSell': canSell,
    'canManageInventory': canManageInventory,
    'canViewReports': canViewReports,
    'canManageStaff': canManageStaff,
  };
}

/// DTO Cửa hàng (StoreDto) khớp 100% với Backend/Edge Function Phần 1.
class StoreDto {
  final String id;
  final String name;
  final String slug;
  final String role;
  final String storeType;
  final String currency;
  final String timezone;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final StorePermissions permissions;

  const StoreDto({
    required this.id,
    required this.name,
    required this.slug,
    required this.role,
    required this.storeType,
    required this.currency,
    required this.timezone,
    this.createdAt,
    this.updatedAt,
    required this.permissions,
  });

  bool get isOwner => role == 'owner';

  factory StoreDto.fromJson(Map<String, dynamic> json) {
    return StoreDto(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      slug: json['slug'] as String? ?? '',
      role: json['role'] as String? ?? 'staff',
      storeType: json['storeType'] as String? ?? 'groceries',
      currency: json['currency'] as String? ?? 'VND',
      timezone: json['timezone'] as String? ?? 'Asia/Ho_Chi_Minh',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'] as String)
          : null,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'] as String)
          : null,
      permissions: StorePermissions.fromJson(
        json['permissions'] as Map<String, dynamic>? ?? {},
      ),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'slug': slug,
    'role': role,
    'storeType': storeType,
    'currency': currency,
    'timezone': timezone,
    'createdAt': createdAt?.toIso8601String(),
    'updatedAt': updatedAt?.toIso8601String(),
    'permissions': permissions.toJson(),
  };

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is StoreDto && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}
