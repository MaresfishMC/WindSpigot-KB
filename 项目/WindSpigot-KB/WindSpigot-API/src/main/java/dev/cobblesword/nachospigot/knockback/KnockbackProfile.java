package dev.cobblesword.nachospigot.knockback;

/**
 * 击退配置接口 - 扩展原版KnockbackProfile
 * 
 * 新增功能:
 * - 疾跑击退宽松判定
 * - 空中/地面分开判定
 * - 动态misplay调整
 * 
 * @author WindSpigot
 */
public interface KnockbackProfile {

	// ==================== 基础方法 ====================
	
	void save();
	void save(boolean projectiles);
	String getName();
	void setName(String name);

	// ==================== 基础击退参数 ====================
	
	double getHorizontal();
	void setHorizontal(double horizontal);
	double getVertical();
	void setVertical(double vertical);
	double getVerticalMin();
	void setVerticalMin(double verticalMin);
	double getVerticalMax();
	void setVerticalMax(double verticalMax);
	double getExtraHorizontal();
	void setExtraHorizontal(double extraHorizontal);
	double getExtraVertical();
	void setExtraVertical(double extraVertical);
	double getFrictionHorizontal();
	void setFrictionHorizontal(double frictionHorizontal);
	double getFrictionVertical();
	void setFrictionVertical(double frictionVertical);
	boolean isStopSprint();
	void setStopSprint(boolean stopSprint);

	// ==================== 投射物击退 ====================
	
	double getRodHorizontal();
	void setRodHorizontal(double rodHorizontal);
	double getRodVertical();
	void setRodVertical(double rodVertical);
	double getArrowHorizontal();
	void setArrowHorizontal(double arrowHorizontal);
	double getArrowVertical();
	void setArrowVertical(double arrowVertical);
	double getPearlHorizontal();
	void setPearlHorizontal(double pearlHorizontal);
	double getPearlVertical();
	void setPearlVertical(double pearlVertical);
	double getSnowballHorizontal();
	void setSnowballHorizontal(double snowballHorizontal);
	double getSnowballVertical();
	void setSnowballVertical(double snowballVertical);
	double getEggHorizontal();
	void setEggHorizontal(double eggHorizontal);
	double getEggVertical();
	void setEggVertical(double eggVertical);

	// ==================== W-Tap击退 ====================
	
	double getWTapExtraHorizontal();
	void setWTapExtraHorizontal(double wTapHorizontal);
	double getWTapExtraVertical();
	void setWTapExtraVertical(double wTapVertical);

	// ==================== 附加击退 ====================
	
	double getAddHorizontal();
	void setAddHorizontal(double addHorizontal);
	double getAddVertical();
	void setAddVertical(double addVertical);

	// ==================== 疾跑击退宽松判定 ====================
	
	/**
	 * 疾跑击退水平系数 (默认1.0)
	 * 用于宽松判定，值越大疾跑击退越明显
	 */
	double getSprintHorizontalMultiplier();
	void setSprintHorizontalMultiplier(double multiplier);
	
	/**
	 * 疾跑击退垂直系数 (默认1.0)
	 */
	double getSprintVerticalMultiplier();
	void setSprintVerticalMultiplier(double multiplier);
	
	/**
	 * 是否启用疾跑宽松判定 (默认true)
	 */
	boolean isSprintLenientEnabled();
	void setSprintLenientEnabled(boolean enabled);

	// ==================== 空中/地面分开判定 ====================
	
	/**
	 * 空中水平击退系数 (默认1.0)
	 */
	double getAirHorizontalMultiplier();
	void setAirHorizontalMultiplier(double multiplier);
	
	/**
	 * 空中垂直击退系数 (默认1.0)
	 */
	double getAirVerticalMultiplier();
	void setAirVerticalMultiplier(double multiplier);
	
	/**
	 * 地面水平击退系数 (默认1.0)
	 */
	double getGroundHorizontalMultiplier();
	void setGroundHorizontalMultiplier(double multiplier);
	
	/**
	 * 地面垂直击退系数 (默认1.0)
	 */
	double getGroundVerticalMultiplier();
	void setGroundVerticalMultiplier(double multiplier);

	// ==================== 动态Misplay调整 ====================
	
	/**
	 * 是否启用动态misplay (默认false)
	 */
	boolean isDynamicMisplayEnabled();
	void setDynamicMisplayEnabled(boolean enabled);
	
	/**
	 * 目标misplay值 (默认0)
	 * 用于动态调整击退强度
	 */
	double getTargetMisplay();
	void setTargetMisplay(double targetMisplay);
	
	/**
	 * Misplay补偿系数 (默认0.5)
	 */
	double getMisplayCompensation();
	void setMisplayCompensation(double compensation);

	// ==================== 显示值 ====================
	
	String[] getKnockbackValues();
	String[] getProjectilesValues();
	String[] getAdvancedValues();
}