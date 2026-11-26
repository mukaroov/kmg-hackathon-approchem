# Developments in Petroleeum Science,8  fundamentals of -- L P  Dake (Eds ) -- Developments in petrole

*OCR: mistral-ocr-latest  |  рисунки: gpt-5.6-terra  |  2026-08-22*

---

<!-- page 75 -->
130

DARCY'S LAW AND APPLICATIONS

9) Amyx, J.W., Bass, D.M. and Whiting, R.L., 1960. Petroleum Reservoir Engineering — Physical Properties. McGraw-Hill: 86-96.

10) Herbeck, E.F., Heintz, R.C. and Hastings, J.R., 1976. Fundamentals of Tertiary Oil Recovery. Series of articles appearing in the "Petroleum Engineer", January — September.

# CHAPTER 5

# THE BASIC DIFFERENTIAL EQUATION FOR RADIAL FLOW IN A POROUS MEDIUM

# 5.1 INTRODUCTION

In this chapter the basic equation for the radial flow of a fluid in a homogeneous porous medium is derived as

$$\frac{1}{r} \frac{\partial}{\partial r} \left( \frac{k \rho}{\mu} r \frac{\partial p}{\partial r} \right) = \phi c \rho \frac{\partial p}{\partial t} \tag{5.1}$$

This equation is non-linear since the coefficients on both sides are themselves functions of the dependent variable, the pressure. In order to obtain analytical solutions, it is first necessary to linearize the equation by expressing it in a form in which the coefficients have a negligible dependence upon the pressure and can be considered as constants. An approximate form of linearization applicable to liquid flow is presented at the end of the chapter in which equ. (5.1) is reduced to the form of the radial diffusivity equation. Solutions of this equation and their applications for the flow of oil are presented in detail in Chapters 6 and 7. For the flow of a real gas, however, a more complex linearization by integral transformation is required which will be presented separately in Chapter 8.

# 5.2 DERIVATION OF THE BASIC RADIAL DIFFERENTIAL EQUATION

The basic differential equation will be derived in radial form thus simulating the flow of fluids in the vicinity of a well. Analytical solutions of the equation can then be obtained under various boundary and initial conditions for use in the description of well testing and well inflow, which have considerable practical application in reservoir engineering. This is considered of greater importance than deriving the basic equation in cartesian coordinates since analytical solutions of the latter are seldom used in practice by field engineers. In numerical reservoir simulation, however, cartesian geometry is more commonly used but even in this case the flow into or out of a well is controlled by equations expressed in radial form such as those presented in the next four chapters. The radial cell geometry is shown in fig. 5.1 and initially the following simplifying assumptions will be made.

a) The reservoir is considered homogeneous in all rock properties and isotropic with respect to permeability.
b) The producing well is completed across the entire formation thickness thus ensuring fully radial flow.

<!-- page 76 -->
132

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

133

c) The formation is completely saturated with a single fluid.


Fig. 5.1 Radial flow of a single phase fluid in the vicinity of a producing well.

Consider the flow through a volume element of thickness dr situated at a distance r from the centre of the radial cell. Then applying the principle of mass conservation

$$\begin{array}{l} \text { Mass flow rate } \\ \text { IN } \end{array} - \begin{array}{l} \text { Mass flow rate } \\ \text { OUT } \end{array} = \begin{array}{l} \text { Rate of change of mass in } \\ \text { the volume element } \end{array}$$
$$q \rho | _ {r + d r} - q \rho | _ {r} = 2 \pi r h \phi d r \frac {\partial \rho}{\partial t}$$

where $2\pi rh\phi dr$ is the volume of the small element of thickness dr. The left hand side of this equation can be expanded as

$$\left(q \rho | _ {r} + \frac {\partial (q \rho)}{\partial r} d r - q \rho | _ {r}\right) = 2 \pi r h \phi d r \frac {\partial \rho}{\partial t}$$

which simplifies to

$$\frac {\partial (q \rho)}{\partial r} = 2 \pi r h \phi \frac {\partial \rho}{\partial t} \tag {5.2}$$

By applying Darcy's Law for radial, horizontal flow it is possible to substitute for the flow rate q in equ. (5.2) since

$$q = \frac {2 \pi k h r}{\mu} \frac {\partial p}{\partial r}$$

giving

$$\frac {\partial}{\partial r} \left(\frac {2 \pi k h r}{\mu} \rho \frac {\partial p}{\partial r}\right) = 2 \pi r h \phi \frac {\partial \rho}{\partial t}$$

or

$$\frac {1}{r} \frac {\partial}{\partial r} \left(\frac {k \rho}{\mu} r \frac {\partial p}{\partial r}\right) = \phi \frac {\partial \rho}{\partial t} \tag {5.3}$$

The time derivative of the density appearing on the right hand side of equ. (5.3) can be expressed in terms of a time derivative of the pressure by using the basic thermodynamic definition of isothermal compressibility

$$c = - \frac {1}{V} \frac {\partial V}{\partial p}$$

and since

$$\rho = \frac {m}{V}$$

then the compressibility can be alternatively expressed as

$$c = - \frac {\rho}{m} \frac {\partial \left(\frac {m}{\rho}\right)}{\partial p} = \frac {1}{\rho} \frac {\partial \rho}{\partial p} \tag {5.4}$$

and differentiating with respect to time gives

$$c \rho \frac {\partial p}{\partial t} = \frac {\partial \rho}{\partial t} \tag {5.5}$$

Finally, substituting equ. (5.5) in equ. (5.3) reduces the latter to

$$\frac {1}{r} \frac {\partial}{\partial r} \left(\frac {k \rho}{\mu} r \frac {\partial p}{\partial r}\right) = \phi c \rho \frac {\partial p}{\partial t} \tag {5.1}$$

This is the basic, partial differential equation for the radial flow of any single phase fluid in a porous medium. The equation is referred to as non-linear because of the implicit pressure dependence of the density, compressibility and viscosity appearing in the coefficients $k\rho/\mu$ and $\phi c\rho$. Because of this, it is not possible to find simple analytical solutions of the equation without first linearizing it so that the coefficients somehow lose their pressure dependence. A simple form of linearization applicable to the flow of liquids of small and constant compressibility (under-saturated oil) will be considered in sec. 5.4, while a more rigorous method, using the Kirchhoff integral transformation, will be presented in Chapter 8 for the more complex case of linearization for the flow of a real gas.

### 5.3 CONDITIONS OF SOLUTION

In principle, an infinite number of solutions of equ. (5.1) can be obtained depending on the initial and boundary conditions imposed. The most common and useful of these is called the constant terminal rate solution for which the initial condition is that at some fixed time, at which the reservoir is at equilibrium pressure $p_i$, the well is produced at a constant rate q at the wellbore, $r=r_w$. This type of solution will be examined in detail in Chapters 7 and 8 but it is appropriate, at this stage, to describe the three most common, although not exclusive, conditions for which the constant terminal rate solution is sought. These conditions are called transient, semi steady state and steady state and are each applicable at different times after the start of production and for different, assumed boundary conditions.

<!-- page 77 -->
134

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

135

# a) Transient condition

This condition is only applicable for a relatively short period after some pressure disturbance has been created in the reservoir. In terms of the radial flow model this disturbance would be typically caused by altering the well's production rate at $r=r_w$. In the time for which the transient condition is applicable it is assumed that the pressure response in the reservoir is not affected by the presence of the outer boundary, thus the reservoir appears infinite in extent. The condition is mainly applied to the analysis of well tests in which the well's production rate is deliberately changed and the resulting pressure response in the wellbore is measured and analysed during a brief period of a few hours after the rate change has occurred. Then, unless the reservoir is extremely small, the boundary effects will not be felt and the reservoir is, mathematically, infinite.

This gives rise to a complex solution of equ. (5.1) in which both the pressure and pressure derivative, with respect to time, are themselves functions of both position and time, thus

$$p = g(r,t)$$

and $$\frac{\partial p}{\partial t} = f(r,t)$$

Transient analysis techniques and their application to oil and gas well testing will be described in Chapters 7 and 8, respectively.

# b) Semi Steady State condition


Fig. 5.2 Radial flow under semi steady state conditions.

This condition is applicable to a reservoir which has been producing for a sufficient period of time so that the effect of the outer boundary has been felt. In terms of the radial flow model, the situation is depicted in fig. 5.2. It is considered that the well is surrounded, at its outer boundary, by a solid "brick wall" which prevents the flow of fluids into the radial cell. Thus at the outer boundary, in accordance with Darcy's law

$$\frac{\partial p}{\partial r} = 0 \quad \text{at} \quad r = r_e \tag{5.6}$$

Furthermore, if the well is producing at a constant flow rate then the cell pressure will decline in such a way that

$$\frac{\partial p}{\partial t} \approx \text{constant, for all } r \text{ and } t. \tag{5.7}$$

The constant referred to in equ. (5.7) can be obtained from a simple material balance using the compressibility definition, thus

$$cV \frac{dp}{dt} = - \frac{dV}{dt} = - q \tag{5.8}$$

$$\text{or} \quad \frac{dp}{dt} = - \frac{q}{cV} \tag{5.9}$$

which for the drainage of a radial cell can be expressed as

$$\frac{dp}{dt} = - \frac{q}{c \pi r_e^2 h \phi} \tag{5.10}$$

This is a condition which will be applied in Chapter 6, for oil flow, and in Chapter 8, for gas flow, to derive the well inflow equations under semi steady state conditions, even though in the latter case the gas compressibility is not constant.

One important feature of this stabilized type of solution, when applied to a depletion type reservoir, has been pointed out by Matthews, Brons and Hazebroek¹ and is illustrated in fig. 5.3. This is the fact that, once the reservoir is producing under the semi steady state condition, each well will drain from within its own no-flow boundary quite independently of the other wells.

For this condition dp/dt must be approximately constant throughout the entire reservoir otherwise flow would occur across the boundaries causing a re-adjustment in their positions until stability was eventually achieved. In this case a simple technique can be applied to determine the volume averaged reservoir pressure

$$\bar{p}_{res} = \frac{\sum \bar{p}_i V_i}{\sum V_i} \tag{5.11}$$

in which

$V_i$ = the pore volume of the iᵗʰ drainage volume

and $\bar{p}_i$ = the average pressure within the iᵗʰ drainage volume.

Equation (5.9) implies that since dp/dt is constant for the reservoir then, if the variation in the compressibility is small

<!-- page 78 -->
136

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

137


Fig. 5.3 Reservoir depletion under semi steady state conditions.

$$q_i \propto V_i \tag{5.12}$$

and hence the volume average in equ. (5.11) can be replaced by a rate average, as follows

$$\overline{p}_{res} = \frac{\sum_i \overline{p}_i q_i}{\sum_i q_i} \tag{5.13}$$

and, whereas the $V_i$'s are difficult to determine in practice, the $q_i$'s are measured on a routine basis throughout the lifetime of the field thus facilitating the calculation of $\overline{p}_{res}$, which is the pressure at which the reservoir material balance is evaluated. The method by which the individual $\overline{p}_i$'s can be determined will be detailed in Chapter 7, sec. 7.

Steady State condition


Fig. 5.4 Radial flow under steady state conditions.

The steady state condition applies, after the transient period, to a well draining a cell which has a completely open outer boundary. It is assumed that, for a constant rate of production, fluid withdrawal from the cell will be exactly balanced by fluid entry across the open boundary and therefore,

$$p = p_e = \text{constant, at } r = r_e \tag{5.14}$$

$$\text{and } \frac{\partial p}{\partial t} = 0 \text{ for all } r \text{ and } t \tag{5.15}$$

This condition is appropriate when pressure is being maintained in the reservoir due to either natural water influx or the injection of some displacing fluid (refer Chapter 10).

It should be noted that the semi steady state and steady state conditions may never be fully realised in the reservoir. For instance, semi steady state flow equations are frequently applied when the rate, and consequently the position of the no-flow boundary surrounding a well, are slowly varying functions of time. Nevertheless, the defining conditions specified by equ. (5.7) and (5.15) are frequently approximated in the field since both production and injection facilities are usually designed to operate at constant rates and it makes little sense to unnecessarily alter these. If the production rate of an individual well is changed, for instance, due to closure for repair or increasing the rate to obtain a more even fluid withdrawal pattern throughout the reservoir, there will be a brief period when transient flow conditions prevail followed by stabilized flow for the new distribution of individual well rates.

### 5.4 THE LINEARIZATION OF EQUATION 5.1 FOR FLUIDS OF SMALL AND CONSTANT COMPRESSIBILITY

A simple linearization of equ. (5.1) can be obtained by deletion of some of the terms, dependent upon making various assumptions concerning the nature of fluid for which solutions are being sought. In this section the fluid considered will be a liquid which, in a practical sense, will apply to the flow of undersaturated oil. Expanding the left hand side of equ. (5.1), using the chain rule for differentiation gives

$$\frac{1}{r} \left[ \frac{\partial}{\partial r} \left( \frac{k}{\mu} \right) \rho r \frac{\partial p}{\partial r} + \frac{k}{\mu} \frac{\partial p}{\partial r} r \frac{\partial p}{\partial r} + \frac{k \rho}{\mu} \frac{\partial p}{\partial r} + \frac{k \rho}{\mu} r \frac{\partial^2 p}{\partial r^2} \right] = \phi c \rho \frac{\partial p}{\partial t} \tag{5.16}$$

and differentiating equ. (5.4) with respect to r gives

$$c \rho \frac{\partial p}{\partial r} = \frac{\partial p}{\partial r} \tag{5.17}$$

which when substituted into equ. (5.16) changes the latter to

$$\frac{1}{r} \left[ \frac{\partial}{\partial r} \left( \frac{k}{\mu} \right) \rho r \frac{\partial p}{\partial r} + \frac{k}{\mu} c \rho r \left( \frac{\partial p}{\partial r} \right)^2 + \frac{k \rho}{\mu} \frac{\partial p}{\partial r} + \frac{k \rho}{\mu} r \frac{\partial^2 p}{\partial r^2} \right] = \phi c \rho \frac{\partial p}{\partial t} \tag{5.18}$$

<!-- page 79 -->
138

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

RADIAL DIFFERENTIAL EQUATION FOR FLUID FLOW

139

For liquid flow, the following assumptions are conventionally made

- the viscosity $\mu$ is practically independent of pressure and may be regarded as a constant
- the pressure gradient $\partial p/\partial r$ is small and therefore, terms of the order $(\partial p/\partial r)^2$ can be neglected.

These two assumptions eliminate the first two terms in the left hand side of equ. (5.18), reducing the latter to

$$\frac{\partial^2 p}{\partial r^2} + \frac{1}{r} \frac{\partial p}{\partial r} = \frac{\phi \mu c}{k} \frac{\partial p}{\partial t} \tag{5.19}$$

which can be more conveniently expressed as

$$\frac{1}{r} \frac{\partial}{\partial r} \left( r \frac{\partial p}{\partial r} \right) = \frac{\phi \mu c}{k} \frac{\partial p}{\partial t} \tag{5.20}$$

Making one final assumption, that the compressibility is constant, means that the coefficient $\phi \mu c/k$ is also constant and therefore, the basic equation has been effectively linearized.

For the flow of liquids the above assumptions are quite reasonable and have been frequently applied in the past. Dranchuk and Quon$^3$, however, have shown that this simple linearization by deletion must be treated with caution and can only be applied when the product

$$cp \ll 1 \tag{5.21}$$

This condition makes it necessary to modify the final assumption so that the compressibility is not just constant but both small and constant. The compressibility appearing in equ. (5.20) is the total, or saturation weighted, compressibility of the entire reservoir-liquid system

$$c_t = c_o S_o + c_w S_{wc} + c_f \tag{5.22}$$

in which the saturations are expressed as fractions of the pore volume. Using typical figures for the components of equ. (5.22)

$$\begin{array}{ll} c_o = 10 \times 10^{-6} / \text{psi} & S_{wc} = 0.2 \\ c_w = 3 \times 10^{-6} / \text{psi} & p = 3000 \text{ psi} \\ c_f = 6 \times 10^{-6} / \text{psi} & \end{array}$$

then $c_t$ in equ. (5.22) has the value $14.6 \times 10^{-6} / \text{psi}$ and the product expressed by equ. (5.21) has the value 0.04, which satisfies the necessary condition for this simple linearization to be valid. However, when dealing with reservoir systems which have a higher total compressibility it will be necessary to linearize equ. (5.1) using some form of integral transformation as detailed by Dranchuk and Quon. Such an approach will be required when describing the flow of a real gas since, in this case,

the compressibility of the gas alone may, to a first approximation, be expressed as the reciprocal of the pressure and the cp product, equ. (5.21), will itself be unity. The linearization of equ. (5.1) under these circumstances will be described in Chapter 8, secs. 2-4.

Before leaving the subject of compressibility, it should be noted that the product of $\phi$ and c in all the equations, in this and the following chapters, is conventionally expressed as

$$\phi_{\text{absolute}} \times (c_o S_o + c_w S_{wc} + c_f) \tag{5.23}$$

since it was assumed in deriving equ. (5.1) that the porous medium was completely saturated with a single fluid thus implying the use of the absolute porosity. Alternatively, allowing for the presence of a connate water saturation, the $\phi c$ product can be interpreted as

$$\phi_{\text{absolute}} (1 - S_{wc}) \times \frac{(c_o S_o + c_w S_{wc} + c_f)}{(1 - S_{wc})} \tag{5.24}$$

in which $\phi_{\text{absolute}} (1 - S_{wc})$ is the effective, hydrocarbon porosity, and the compressibility is equivalent to that derived in Chapter 3, equ. (3.19), which is used in conjunction with the hydrocarbon pore volume. In either event, the products expressed in equ. (5.23) and (5.24) have the same value, the reader must only be careful not to mix the individual terms appearing in the separate equations.

Equation (5.20) is the radial diffusivity equation in which the coefficient $k/\phi \mu c$ is called the diffusivity constant. This is an equation which is frequently applied in physics, for instance, the temperature distribution due to the conduction of heat in radial symmetry would be described by the equation

$$\frac{1}{r} \frac{\partial}{\partial r} \left( r \frac{\partial T}{\partial r} \right) = \frac{1}{K} \frac{\partial T}{\partial t}$$

in which T is the absolute temperature and K the thermal diffusivity constant. Because of the general nature of equ. (5.20) it is not surprising that many reservoir engineering papers, when dealing with complex solutions of the diffusivity equation, make reference to a text book entitled "Conduction of Heat in Solids", by Carslaw and Jaeger$^3$, which gives the solutions of the equation for a large variety of boundary and initial conditions and is regarded as a standard text in reservoir engineering.

# REFERENCES

1) Matthews, C.S., Brons, F. and Hazebroek, P., 1954. A Method for Determination of Average Pressure in a Bounded Reservoir. Trans. AIME. 201: 182-191.

2) Dranchuk, P.M. and Quon, D., 1967. Analysis of the Darcy Continuity Equation. Producers Monthly, October: 25-28.

3) Carslaw, H.S. and Jaeger, J.C., 1959. Conduction of Heat in Solids. Oxford at the Clarendon Press, (2nd edition).

<!-- page 87 -->
154

OILWELL TESTING

OILWELL TESTING

155

The constant terminal rate solution is therefore the equation of $p_{\text{ref}}$ versus t for constant rate production for any value of the flowing time. The pressure decline, fig. 7.1(b), can normally be divided into three sections depending on the value of the flowing time and the geometry of the reservoir or part of the reservoir being drained by the well.

Initially, the pressure response can be described using a transient solution of the diffusivity equation. It is assumed during this period that the pressure response at the wellbore is not affected by the drainage boundary of the well and vice versa. This is frequently referred to as the infinite reservoir case since, during the transient flow period, the reservoir appears to be infinite in extent.

The transient phase is followed by the so-called late transient period during which the influence of the drainage boundary begins to be felt. For a well producing from within a no-flow boundary both the shape of the area drained and position of the well with respect to the boundary are of major importance in determining the appropriate late transient constant terminal rate solution.

Eventually, stabilised flow conditions will prevail which means that for the no-flow boundary case the rate of change of wellbore pressure with respect to time is constant. This corresponds to the semi steady state condition described in Chapter 5, sec 3(b).

The constant terminal rate solution, for all values of the flowing time, was first presented to the Industry by Hurst and Van Everdingen in 1949. In their classic paper on the subject¹, the authors solved the radial diffusivity equation using the Laplace transform for both the constant terminal rate and constant terminal pressure cases. The latter, which is relevant to water influx calculations, will be described in Chapter 9.

The full Hurst and Van Everdingen solution, equ. 7.34, is a most intimidating mathematical equation which contains as one of its components an infinite summation of Bessel functions. The complexity is due to the wellbore pressure response during the late transient period, since for transient and semi steady state flow relatively simple solutions can be obtained which will be described in sec. 7.3. The fact that the full solution is so complex is rather unfortunate since the constant terminal rate solution of the radial diffusivity equation can be regarded as the basic equation in wellbore pressure analysis techniques. By superposition of such solutions, as will be shown in sec. 7.5, the pressure response at the wellbore can be theoretically described for any sequence of different rates acting for different periods of time, and this is the general method employed in the analysis of any form of oil or gas well test.

### 7.3 THE CONSTANT TERMINAL RATE SOLUTION FOR TRANSIENT AND SEMI STEADY STATE FLOW CONDITIONS

During the initial transient flow period, it has been found that the constant terminal rate solution of the radial diffusivity equation, determined using the Laplace transform, can be approximated by the so-called line source solution which assumes that in comparison to the apparently infinite reservoir the wellbore radius is negligible

and the wellbore itself can be treated as a line. This leads to a considerable simplification in the mathematics and for this solution the boundary and initial conditions may be stated as follows

a) $p = p_i$ at $t = 0$, for all $r$

b) $p = p_i$ at $r = \infty$, for all $t$ (7.1)

c) $\lim_{r \to 0} r \frac{\partial p}{\partial r} = \frac{q\mu}{2\pi kh}$, for $t > 0$

Condition (a) is merely the initial condition that, before producing, the pressure everywhere within the drainage volume is equal to the initial equilibrium pressure $p_i$. Condition (b) ensures the condition of transience, namely that the pressure at the outer, infinite boundary is not affected by the pressure disturbance at the wellbore and vice versa.

Condition (c) is the line source inner boundary condition.

In addition, the assumptions made in deriving the radial diffusivity equation in Chapter 5 are retained. That is, that the formation is homogeneous and isotropic, and drained by a fully penetrating well to ensure radial flow; the fluid itself must have a constant viscosity and a small and constant compressibility. The solution obtained will, therefore, be applicable to the flow of undersaturated oil. Having developed the simple theory of pressure analysis based on these assumptions, many of the restrictions will be removed by considering, for instance, the effects of partial well completion, the flow of highly compressible fluids, etc. These modifications to the basic theory will be gradually introduced in this and the following chapter.

Under the above conditions the diffusivity equation

$$\frac{1}{r} \frac{\partial}{\partial r} \left( r \frac{\partial p}{\partial r} \right) = \frac{\phi \mu c}{k} \frac{\partial p}{\partial t} \tag{5.20}$$

can be solved by making use of Boltzmann's transformation

$$s = \frac{r^2}{4(\text{Diffusivity constant})t} = \frac{\phi \mu c r^2}{4kt}$$

so that

$$\frac{\partial s}{\partial r} = \frac{\phi \mu c r}{2kt} \tag{7.2}$$

and

$$\frac{\partial s}{\partial t} = - \frac{\phi \mu c r^2}{4kt^2} \tag{7.3}$$

Equation (5.20) can be expressed with respect to this new variable as

<!-- page 88 -->
156

OILWELL TESTING

OILWELL TESTING

157

$$\frac{1}{r} \frac{d}{ds} \left( r \frac{dp}{ds} \frac{\partial s}{\partial r} \right) \frac{\partial s}{\partial r} = \frac{\phi \mu c}{k} \frac{dp}{ds} \frac{\partial s}{\partial t}$$

and using equs. (7.2) and (7.3), this becomes

$$\frac{1}{r} \frac{\phi \mu c r}{2kt} \frac{d}{ds} \left( \frac{\phi \mu c r^2}{2kt} \frac{dp}{ds} \right) = - \left( \frac{\phi \mu c r}{2kt} \right)^2 \frac{dp}{ds}$$

which can be simplified as

$$\frac{d}{ds} \left( s \frac{dp}{ds} \right) = -s \frac{dp}{ds}$$

or

$$\frac{dp}{ds} + s \frac{d}{ds} \left( \frac{dp}{ds} \right) = -s \frac{dp}{ds}$$

This is an ordinary differential equation which can be solved by letting

$$\frac{dp}{ds} = p'$$

Then

$$p' + s \frac{dp'}{ds} = -sp'$$

$$\frac{dp'}{p'} = - \frac{(s+1)}{s} ds \tag{7.4}$$

Integrating equ. (7.4) gives

$$\ln p' = - \ln s - s + C_1$$

or

$$p' = C_2 \frac{e^{-s}}{s} \tag{7.5}$$

where $C_1$ and $C_2$ are constants of integration and $C_2$ can be evaluated using the line source boundary condition

$$\lim_{r \to 0} r \frac{\partial p}{\partial r} = \frac{q\mu}{2\pi kh} = r \frac{dp}{ds} \frac{\partial s}{\partial r} = 2s \frac{dp}{ds}$$

therefore,

$$\frac{q\mu}{4\pi kh} = C_2 e^{-s}$$

which yields, as r (and therefore s) tends to zero

$$C_2 = \frac{q\mu}{4\pi kh}$$

Equation (7.5) can now be integrated between the limits $t = 0$ ($s \to \infty$) and the current value of t, for which $s = x$; and $p_i$ (initial pressure) and the current pressure p.

i.e.

$$\int_{p_i}^{p} dp = \frac{q\mu}{4\pi kh} \int_{\infty}^{x} \frac{e^{-s}}{s} ds$$

which gives

$$\begin{array}{l} p_{r,t} = p_i - \frac{q\mu}{4\pi kh} \int_{\infty}^{\infty} \frac{e^{-s}}{s} ds \tag{7.6} \\ x = \frac{\phi \mu c r^2}{4kt} \end{array}$$

Equation (7.6) is the line source solution of the diffusivity equation giving the pressure $p_{r,t}$ as a function of position and time.

The integral

(7.7)

$$\int_{x}^{\infty} \frac{e^{-s}}{s} ds = \int_{x}^{\infty} \frac{e^{-s}}{s} ds \quad x = \frac{\phi \mu c r^2}{4kt}$$

is a standard integral, called the exponential integral, and is denoted by ei(x).

Qualitatively, the nature of this integral can be understood by considering the component parts, fig. 7.2.

The integral of curve (c) between x and $\infty$ will have the shape shown in fig. 7.2 (d). Thus ei (x) is large for small values of x, since the ei-function is the area under the graph from the particular value of x out to infinity (i.e. the shaded area in curve (c) of fig. 7.2) and, conversely, small for large values of x. The ei-function is normally plotted on a log-log scale and such a version is included as fig. 7.3. From this curve it can be seen that if x < 0.01, ei (x) can be approximated as

$$ei(x) \approx - \ln x - 0.5772 \tag{7.8}$$

<!-- page 89 -->
158

OILWELL TESTING

OILWELL TESTING

159


----
━━━ FORMAT 6: XY PLOT / CHART WITH DATA ━━━
(a)

Vertical axis: $e^{-s}$; scale and units not shown.  
Horizontal axis: $s$; linear scale; range not labelled.

Curve: $e^{-s}$ decreases monotonically with increasing $s$.

> Тренд: $e^{-s}$ убывает при увеличении $s$.

━━━ FORMAT 6: XY PLOT / CHART WITH DATA ━━━
(b)

Vertical axis: $\dfrac{1}{s}$; scale and units not shown.  
Horizontal axis: $s$; linear scale; range not labelled.

Curve: $\dfrac{1}{s}$ decreases steeply at low $s$ and flattens with increasing $s$.

> Тренд: $\dfrac{1}{s}$ убывает при увеличении $s$.

━━━ FORMAT 6: XY PLOT / CHART WITH DATA ━━━
(c)

Vertical axis: $\dfrac{e^{-s}}{s}$; scale and units not shown.  
Horizontal axis: $s$; linear scale; range not labelled.

Relation shown:  
$$
e^{-s}\times\frac{1}{s}=\frac{e^{-s}}{s}.
$$

Curve: $\dfrac{e^{-s}}{s}$ decreases sharply with increasing $s$. The area below the curve is hatched.

> Тренд: произведение $e^{-s}$ и $\dfrac{1}{s}$ образует убывающую функцию $\dfrac{e^{-s}}{s}$.

KEYWORDS: $e^{-s}$, $\frac{1}{s}$, $\frac{e^{-s}}{s}$, график, функция, произведение
----


Fig. 7.2 The exponential integral function ei(x).

where the number 0.5772 is Euler's constant, the exponential of which is denoted by

$$\gamma = e^{0.5772} = 1.781$$

and therefore equ. (7.8) can be expressed as

$$ei(x) \approx - \ln (\gamma x)$$

$$\text{for } x < 0.01$$

(7.9)

The separate plots of ei(x) and -ln(γx), in Fig. 7.3, demonstrate the range of validity of equ. (7.9). The significance of this approximation is that reservoir engineers are frequently concerned with the analysis of pressures measured in the wellbore, at r=r_w. Since in this case x=dμcr_w^2/4kt, it is usually found that for measurements in the wellbore, x will be less than 0.01 even for small values of t. Equation (7.6) can then be approximated as

$$p_{rw^2} = p_{wf} = p_i - \frac{q\mu}{4\pi kh} \ln \frac{4kt}{\gamma \phi \mu c r_w^2}$$

Or, if the van Everdingen mechanical skin factor is included as a time independent perturbation (ref. Chapter 4, sec. 7), then

$$p_{wf} = p_i - \frac{q\mu}{4\pi kh} \left( \ln \frac{4kt}{\gamma \phi \mu c r_w^2} + 2S \right) \tag{7.10}$$

As expected for this transient solution there is no dependence at all upon the area drained or well position with respect to the boundary since for the short time when equ.(7.10) is applicable the reservoir appears to be infinite in extent.


----
━━━ FORMAT 6: XY PLOT / CHART WITH DATA ━━━

Ось абсцисс: $x$, логарифмическая шкала; диапазон от $10^{-3}$ до $10^{0}$.

Ось ординат слева: $e_i(x)$, логарифмическая шкала; видимые отметки: $10^{1}$, 8, 6, 4, 2, $10^{-2}$, 8, 6, 4, 2, $10^{-3}$.

Ось ординат справа: $e_i(x)$ / $\ln \gamma x$; видимые отметки: $10^{0}$, 8, 6, 4, 2, $10^{-1}$, 8, 6, 4, 2, $10^{-2}$.

Кривые:
- $e_i(x)$ — кривая в левой части графика, резко убывающая с увеличением $x$.
- $e_i(x)$ — плавная кривая, проходящая через центральную и правую части графика.
- $\ln \gamma x$ — прямая линия в правой части графика.
- [нрзб] — кривая в правой нижней части графика.

Подпись на графике:
$$e_i(x)=\ln \gamma x+x+\frac{x^2}{4}+\ldots;\quad 0.5772$$

> Тренд: график сопоставляет функцию $e_i(x)$ с её логарифмическим приближением $\ln \gamma x$ при малых значениях $x$.

KEYWORDS: экспоненциальный интеграл, $e_i(x)$, логарифмическая шкала, $\ln \gamma x$, функция, график
----


Fig. 7.3 Graph of the ei-function for 0.001 ≤ x ≤ 5.0.

Sometimes pressure tests are conducted in order to determine the degree of communication between wells, for example, pulse testing. In such cases pressure transients caused in one well are recorded in a distant well and, under these circumstances, r is large and the approximation of equ. (7.9) is no longer valid. Equation (7.6) must then be used in its full form, i.e.

$$p_{r,t} = p_i - \frac{q\mu}{4\pi kh} e^i \left( \frac{\phi \mu c r^2}{4kt} \right) \tag{7.11}$$

in which the values of the exponential integral can be obtained from fig. 7.3.
